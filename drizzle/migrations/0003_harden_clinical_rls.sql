-- Idempotent hardening pass for databases that previously created tables
-- with permissive anonymous policies. All clinical writes must use the approved
-- public.apply_clinical_edit() RPC; direct table access is read-only.
DO $harden$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patients',
    'patient_vitals',
    'patient_nurse_notes',
    'patient_sbar',
    'patient_care_plans',
    'patient_rounds',
    'patient_tranquilizer_events',
    'patient_admissions',
    'staff_assignments',
    'medication_register',
    'ward_shift_settings'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated',
      t
    );
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_approved(auth.uid()))',
      'Approved staff read ' || t,
      t
    );
  END LOOP;
END
$harden$;

ALTER TABLE public.clinical_sync_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_sync_receipts FROM anon, authenticated;
GRANT ALL ON TABLE public.clinical_sync_receipts TO service_role;
DO $receipts$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clinical_sync_receipts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinical_sync_receipts', p.policyname);
  END LOOP;
END
$receipts$;

ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sync_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sync_history FROM authenticated;
GRANT SELECT ON TABLE public.sync_history TO authenticated;
GRANT ALL ON TABLE public.sync_history TO service_role;
DO $history$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sync_history'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sync_history', p.policyname);
  END LOOP;
END
$history$;
CREATE POLICY "Approved staff read sync history"
  ON public.sync_history FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

REVOKE ALL ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) TO authenticated;
