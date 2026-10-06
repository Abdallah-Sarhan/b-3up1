CREATE TABLE public.patient_documents (
  file_no text PRIMARY KEY,
  front_path text,
  back_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_documents TO authenticated;
GRANT ALL ON public.patient_documents TO service_role;
ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved staff read documents" ON public.patient_documents FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Approved staff add documents" ON public.patient_documents FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Approved staff edit documents" ON public.patient_documents FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Approved staff delete documents" ON public.patient_documents FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));
CREATE TRIGGER update_patient_documents_updated_at BEFORE UPDATE ON public.patient_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Approved staff read civil ids" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved staff upload civil ids" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved staff update civil ids" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'civil-ids' AND public.is_approved(auth.uid())) WITH CHECK (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved staff delete civil ids" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));