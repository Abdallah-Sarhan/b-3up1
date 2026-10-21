CREATE SEQUENCE IF NOT EXISTS public.clinical_sync_seq;
GRANT USAGE, SELECT ON SEQUENCE public.clinical_sync_seq TO service_role;

CREATE OR REPLACE FUNCTION public.set_clinical_sync_seq()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.sync_seq := nextval('public.clinical_sync_seq');
  RETURN NEW;
END; $$;

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS changed_at bigint NOT NULL DEFAULT 0;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sync_seq bigint;
DROP TRIGGER IF EXISTS patients_sync_seq ON public.patients;
CREATE TRIGGER patients_sync_seq BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_clinical_sync_seq();
UPDATE public.patients SET version = 1, changed_at = updated_at WHERE version = 0;
CREATE INDEX IF NOT EXISTS patients_sync_seq_idx ON public.patients (sync_seq);

DO $c$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['patient_vitals','patient_nurse_notes','patient_sbar','patient_care_plans','patient_rounds','patient_tranquilizer_events','patient_admissions','staff_assignments','medication_register','ward_shift_settings'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id uuid PRIMARY KEY, patient_id uuid, data jsonb NOT NULL DEFAULT ''{}''::jsonb, version integer NOT NULL DEFAULT 1, changed_at bigint NOT NULL DEFAULT 0, deleted_at timestamptz, updated_by uuid, sync_seq bigint, created_at timestamptz NOT NULL DEFAULT now())', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Approved staff read ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_approved(auth.uid()))', 'Approved staff read ' || t, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (sync_seq)', t || '_sync_seq_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (patient_id)', t || '_patient_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_sync_seq', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_clinical_sync_seq()', t || '_sync_seq', t);
  END LOOP;
END $c$;

CREATE TABLE IF NOT EXISTS public.sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  op_id uuid,
  user_id uuid,
  field text NOT NULL,
  kept jsonb,
  discarded jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sync_history TO authenticated;
GRANT ALL ON public.sync_history TO service_role;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Approved staff read sync history" ON public.sync_history;
CREATE POLICY "Approved staff read sync history" ON public.sync_history FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));

CREATE TABLE IF NOT EXISTS public.clinical_sync_receipts (
  op_id uuid PRIMARY KEY,
  user_id uuid,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.clinical_sync_receipts TO service_role;
ALTER TABLE public.clinical_sync_receipts ENABLE ROW LEVEL SECURITY;

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
      FROM jsonb_each(v_fields) WHERE key IN ('file_no','name','nationality','diagnosis','folder_no','age','doctor','cid','doa','dob','sex','room','bed','marital_status','notes','discharged_at','discharge_note','updated_at','created_at');
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
      v_result := jsonb_build_object('status','conflict','row',v_cur,'conflicts',jsonb_build_array(jsonb_build_object('field','__delete__','kept','not_deleted','discarded','delete')));
    ELSE
      EXECUTE format('UPDATE public.%I t SET deleted_at = now(), version = t.version + 1, changed_at = $2, updated_by = $3 WHERE t.id = $1 RETURNING to_jsonb(t)', p_table)
        INTO v_row USING p_id, p_changed_at, v_uid;
      v_result := jsonb_build_object('status','ok','row',v_row,'conflicts','[]'::jsonb);
    END IF;
  ELSIF v_cur IS NULL THEN
    BEGIN
      IF p_table = 'patients' THEN
        INSERT INTO public.patients (id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,marital_status,notes,discharged_at,discharge_note,updated_at,created_at,version,changed_at,updated_by)
        SELECT p_id,coalesce(nullif(btrim(r.file_no),''),'~'||p_id::text),coalesce(r.name,''),coalesce(r.nationality,''),coalesce(r.diagnosis,''),coalesce(r.folder_no,''),coalesce(r.age,''),coalesce(r.doctor,''),coalesce(r.cid,''),coalesce(r.doa,''),coalesce(r.dob,''),coalesce(r.sex,''),coalesce(r.room,''),coalesce(r.bed,''),coalesce(r.marital_status,''),coalesce(r.notes,''),r.discharged_at,r.discharge_note,coalesce(r.updated_at,0),coalesce(r.created_at,0),1,p_changed_at,v_uid
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
          UPDATE public.patients p SET (file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,marital_status,notes,discharged_at,discharge_note,updated_at,created_at) = (
          SELECT coalesce(nullif(btrim(r.file_no),''),'~'||p_id::text),coalesce(r.name,''),coalesce(r.nationality,''),coalesce(r.diagnosis,''),coalesce(r.folder_no,''),coalesce(r.age,''),coalesce(r.doctor,''),coalesce(r.cid,''),coalesce(r.doa,''),coalesce(r.dob,''),coalesce(r.sex,''),coalesce(r.room,''),coalesce(r.bed,''),coalesce(r.marital_status,''),coalesce(r.notes,''),r.discharged_at,r.discharge_note,coalesce(r.updated_at,0),coalesce(r.created_at,0) FROM jsonb_populate_record(NULL::public.patients, v_merged) r),
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

-- Remove permissive legacy patient policies: permissive policies combine with OR.
REVOKE ALL ON public.patients FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.patients FROM authenticated;
GRANT SELECT ON public.patients TO authenticated;
DROP POLICY IF EXISTS "patients readable by anyone" ON public.patients;
DROP POLICY IF EXISTS "patients insertable by anyone" ON public.patients;
DROP POLICY IF EXISTS "patients updatable by anyone" ON public.patients;
DROP POLICY IF EXISTS "patients deletable by anyone" ON public.patients;
DROP POLICY IF EXISTS "Approved staff read patients" ON public.patients;
CREATE POLICY "Approved staff read patients"
  ON public.patients FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

DO $p$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['patients','patient_vitals','patient_nurse_notes','patient_sbar','patient_care_plans','patient_rounds','patient_tranquilizer_events','patient_admissions','staff_assignments','medication_register','ward_shift_settings'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $p$;