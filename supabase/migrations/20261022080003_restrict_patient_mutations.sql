-- Restrict patient visibility and all direct mutations to the cloud RPC.
-- The first deployment migration created permissive policies for "anyone".
-- PostgreSQL ORs permissive policies, so those must be removed explicitly.
REVOKE ALL ON public.patients FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.patients FROM authenticated;
GRANT SELECT ON public.patients TO authenticated;

DROP POLICY IF EXISTS "patients readable by anyone" ON public.patients;
DROP POLICY IF EXISTS "patients insertable by anyone" ON public.patients;
DROP POLICY IF EXISTS "patients updatable by anyone" ON public.patients;
DROP POLICY IF EXISTS "patients deletable by anyone" ON public.patients;
DROP POLICY IF EXISTS "Approved staff read patients" ON public.patients;
DROP POLICY IF EXISTS "Approved staff add patients" ON public.patients;
DROP POLICY IF EXISTS "Approved staff edit patients" ON public.patients;
DROP POLICY IF EXISTS "Approved staff delete patients" ON public.patients;
CREATE POLICY "Approved staff read patients"
  ON public.patients FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

REVOKE ALL ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) TO authenticated;
