-- All approved staff may read the patient census; clinical mutations go
-- exclusively through apply_clinical_edit so versions/tombstones stay consistent.
REVOKE INSERT, UPDATE, DELETE ON public.patients FROM authenticated, anon;
GRANT SELECT ON public.patients TO authenticated;
REVOKE ALL ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_clinical_edit(uuid, text, uuid, text, integer, jsonb, bigint, uuid) TO authenticated;
