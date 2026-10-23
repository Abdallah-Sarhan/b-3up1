-- Direct-cloud clinical access:
-- all clinical rows require approved staff for reads; all mutations go through
-- public.apply_clinical_edit(), which validates approval and applies version checks.
-- Remove any historical permissive policies because PostgreSQL ORs policies.

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

    -- Remove old ALL/INSERT/UPDATE/DELETE policies on these tables so none
    -- can grant bypass access alongside the approved-staff policy below.
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

-- The edit receipt table is internal to the SECURITY DEFINER mutation RPC.
ALTER TABLE public.clinical_sync_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_sync_receipts FROM anon, authenticated;
GRANT ALL ON TABLE public.clinical_sync_receipts TO service_role;
DO $receipts$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clinical_sync_receipts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinical_sync_receipts', p.policyname);
  END LOOP;
END
$receipts$;

-- Conflict history is read-only to approved staff and written by the edit RPC.
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sync_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sync_history FROM authenticated;
GRANT SELECT ON TABLE public.sync_history TO authenticated;
GRANT ALL ON TABLE public.sync_history TO service_role;
DO $history$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
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

-- Chat history must not be available to authenticated-but-unapproved accounts.
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Approved users manage their own threads" ON public.chat_threads;
CREATE POLICY "Approved users manage their own threads"
  ON public.chat_threads FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.is_approved(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_approved(auth.uid()));

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Approved users manage their own messages" ON public.chat_messages;
CREATE POLICY "Approved users manage their own messages"
  ON public.chat_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.is_approved(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_approved(auth.uid()));
