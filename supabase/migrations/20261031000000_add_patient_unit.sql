-- Persist the patient's assigned Unit and include it in the approved clinical edit RPC.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.apply_clinical_edit(
  p_op_id uuid, p_table text, p_id uuid, p_op text, p_base_version integer,
  p_fields jsonb, p_changed_at bigint, p_patient_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev jsonb; v_cur jsonb; v_cur_fields jsonb; v_fields jsonb; v_merged jsonb;
  v_conflicts jsonb := '[]'::jsonb; v_key text; v_val jsonb; v_version integer;
  v_changed bigint; v_local_wins boolean; v_row jsonb; v_result jsonb; v_existing uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_approved(v_uid) THEN
    RAISE EXCEPTION 'not approved' USING ERRCODE = '42501';
  END IF;
  IF p_table NOT IN ('patients','patient_vitals','patient_nurse_notes','patient_sbar','patient_care_plans','patient_rounds','patient_tranquilizer_events','patient_admissions','staff_assignments','medication_register','ward_shift_settings') THEN RAISE EXCEPTION 'unknown table'; END IF;
  IF p_op NOT IN ('upsert','delete') THEN RAISE EXCEPTION 'unknown op'; END IF;

  SELECT result INTO v_prev FROM public.clinical_sync_receipts WHERE op_id = p_op_id AND user_id = v_uid;
  IF FOUND THEN RETURN v_prev; END IF;

  v_fields := coalesce(p_fields, '{}'::jsonb);
  IF p_table = 'patients' THEN
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_fields
      FROM jsonb_each(v_fields) WHERE key IN ('file_no','name','nationality','diagnosis','folder_no','age','doctor','cid','doa','dob','sex','room','bed','marital_status','notes','discharged_at','discharge_note','unit','updated_at','created_at');
    SELECT to_jsonb(p) INTO v_cur FROM public.patients p WHERE p.id = p_id FOR UPDATE;
    v_cur_fields := v_cur;
  ELSE
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 FOR UPDATE', p_table)
      INTO v_cur USING p_id;
    v_cur_fields := coalesce(v_cur -> 'data', '{}'::jsonb);
  END IF;

  IF v_cur IS NOT NULL AND v_cur ->> 'deleted_at' IS NOT NULL THEN
    v_result := jsonb_build_object('status','deleted','row',v_cur,'conflicts','[]'::jsonb);
  ELSIF p_op = 'delete' THEN
    IF v_cur IS NULL THEN
      v_result := jsonb_build_object('status','ok','row',NULL,'conflicts','[]'::jsonb);
    ELSIF coalesce(p_base_version, 0) < coalesce((v_cur ->> 'version')::integer, 0) THEN
      -- Do not let a stale screen delete a record that another user updated.
      v_result := jsonb_build_object(
        'status','conflict',
        'row',v_cur,
        'conflicts',jsonb_build_array(jsonb_build_object('field','__delete__','kept','not_deleted','discarded','delete'))
      );
    ELSE
      EXECUTE format('UPDATE public.%I t SET deleted_at = now(), version = t.version + 1, changed_at = $2, updated_by = $3 WHERE t.id = $1 RETURNING to_jsonb(t)', p_table)
        INTO v_row USING p_id, p_changed_at, v_uid;
      v_result := jsonb_build_object('status','ok','row',v_row,'conflicts','[]'::jsonb);
    END IF;
  ELSIF v_cur IS NULL THEN
    BEGIN
      IF p_table = 'patients' THEN
        INSERT INTO public.patients (id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,unit,marital_status,notes,discharged_at,discharge_note,updated_at,created_at,version,changed_at,updated_by)
        SELECT p_id,coalesce(nullif(btrim(r.file_no),''),'~'||p_id::text),coalesce(r.name,''),coalesce(r.nationality,''),coalesce(r.diagnosis,''),coalesce(r.folder_no,''),coalesce(r.age,''),coalesce(r.doctor,''),coalesce(r.cid,''),coalesce(r.doa,''),coalesce(r.dob,''),coalesce(r.sex,''),coalesce(r.room,''),coalesce(r.bed,''),coalesce(r.unit,''),coalesce(r.marital_status,''),coalesce(r.notes,''),r.discharged_at,r.discharge_note,coalesce(r.updated_at,0),coalesce(r.created_at,0),1,p_changed_at,v_uid
        FROM jsonb_populate_record(NULL::public.patients, v_fields) r
        RETURNING to_jsonb(patients) INTO v_row;
      ELSE
        EXECUTE format('INSERT INTO public.%I AS t (id, patient_id, data, version, changed_at, updated_by) VALUES ($1,$2,$3,1,$4,$5) RETURNING to_jsonb(t)', p_table)
          INTO v_row USING p_id, p_patient_id, v_fields, p_changed_at, v_uid;
      END IF;
      v_result := jsonb_build_object('status','ok','row',v_row,'conflicts','[]'::jsonb);
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_existing FROM public.patients
        WHERE file_no = btrim(v_fields ->> 'file_no') LIMIT 1;
      v_result := jsonb_build_object('status','file_conflict','existing_id',v_existing,'conflicts','[]'::jsonb);
    END;
  ELSE
    v_version := (v_cur ->> 'version')::integer;
    v_changed := coalesce((v_cur ->> 'changed_at')::bigint, 0);
    v_merged := v_cur_fields;
    v_local_wins := p_changed_at > v_changed
      OR (p_changed_at = v_changed AND v_uid::text > coalesce(v_cur ->> 'updated_by', ''));
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_fields) LOOP
      IF coalesce(p_base_version, 0) < v_version
         AND v_cur_fields ? v_key
         AND (v_cur_fields -> v_key) IS DISTINCT FROM v_val
         AND coalesce(v_cur_fields ->> v_key, '') IS DISTINCT FROM coalesce(v_val #>> '{}', '') THEN
        IF v_local_wins THEN
          v_merged := v_merged || jsonb_build_object(v_key, v_val);
          v_conflicts := v_conflicts || jsonb_build_object('field', v_key, 'kept', v_cur_fields -> v_key, 'discarded', v_val);
        ELSE
          v_conflicts := v_conflicts || jsonb_build_object('field', v_key, 'kept', v_cur_fields -> v_key, 'discarded', v_val);
        END IF;
      ELSE
        v_merged := v_merged || jsonb_build_object(v_key, v_val);
      END IF;
    END LOOP;
    IF jsonb_array_length(v_conflicts) > 0 THEN
      -- Reject the whole write on conflict; never partially save fields from a stale form.
      v_result := jsonb_build_object('status','conflict','row',v_cur,'conflicts',v_conflicts);
    ELSE
      BEGIN
        IF p_table = 'patients' THEN
          UPDATE public.patients p SET (file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,unit,marital_status,notes,discharged_at,discharge_note,updated_at,created_at) = (
          SELECT coalesce(nullif(btrim(r.file_no),''),'~'||p_id::text),coalesce(r.name,''),coalesce(r.nationality,''),coalesce(r.diagnosis,''),coalesce(r.folder_no,''),coalesce(r.age,''),coalesce(r.doctor,''),coalesce(r.cid,''),coalesce(r.doa,''),coalesce(r.dob,''),coalesce(r.sex,''),coalesce(r.room,''),coalesce(r.bed,''),coalesce(r.unit,''),coalesce(r.marital_status,''),coalesce(r.notes,''),r.discharged_at,r.discharge_note,coalesce(r.updated_at,0),coalesce(r.created_at,0) FROM jsonb_populate_record(NULL::public.patients, v_merged) r),
          version = p.version + 1,
          changed_at = greatest(p.changed_at, p_changed_at),
          updated_by = v_uid
        WHERE p.id = p_id RETURNING to_jsonb(p) INTO v_row;
      ELSE
        EXECUTE format('UPDATE public.%I t SET data = $2, patient_id = coalesce($3, t.patient_id), version = t.version + 1, changed_at = greatest(t.changed_at, $4), updated_by = $5 WHERE t.id = $1 RETURNING to_jsonb(t)', p_table)
          INTO v_row USING p_id, v_merged, p_patient_id, p_changed_at, v_uid;
      END IF;
      v_result := jsonb_build_object('status','ok','row',v_row,'conflicts',v_conflicts);
    EXCEPTION WHEN unique_violation THEN
      v_result := jsonb_build_object('status','file_conflict','existing_id',NULL,'conflicts','[]'::jsonb);
    END;
    END IF;
    IF jsonb_array_length(v_conflicts) > 0 THEN
      INSERT INTO public.sync_history (table_name, record_id, op_id, user_id, field, kept, discarded)
      SELECT p_table, p_id, p_op_id, v_uid, c ->> 'field', c -> 'kept', c -> 'discarded'
      FROM jsonb_array_elements(v_conflicts) c;
    END IF;
  END IF;

  INSERT INTO public.clinical_sync_receipts (op_id, user_id, result) VALUES (p_op_id, v_uid, v_result)
    ON CONFLICT (op_id) DO NOTHING;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) TO authenticated;
