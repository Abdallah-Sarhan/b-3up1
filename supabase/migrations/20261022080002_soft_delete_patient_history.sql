-- Keep a removed patient and their linked clinical histories consistently removed
-- from active cloud reads. Rows are retained as tombstones for audit/recovery.
CREATE OR REPLACE FUNCTION public.soft_delete_patient_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed bigint := greatest(coalesce(NEW.changed_at, 0), (extract(epoch FROM clock_timestamp()) * 1000)::bigint);
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.patient_vitals SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.patient_nurse_notes SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.patient_sbar SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.patient_care_plans SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.patient_rounds SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.patient_tranquilizer_events SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.patient_admissions SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.staff_assignments SET deleted_at = now(), version = version + 1, changed_at = v_changed, updated_by = NEW.updated_by WHERE patient_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_patient_children() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS patients_soft_delete_children ON public.patients;
CREATE TRIGGER patients_soft_delete_children
AFTER UPDATE OF deleted_at ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.soft_delete_patient_children();
