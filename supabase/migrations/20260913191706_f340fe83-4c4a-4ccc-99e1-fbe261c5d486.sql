CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  diagnosis TEXT NOT NULL DEFAULT '',
  folder_no TEXT NOT NULL DEFAULT '',
  age TEXT NOT NULL DEFAULT '',
  doctor TEXT NOT NULL DEFAULT '',
  cid TEXT NOT NULL DEFAULT '',
  doa TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  bed TEXT NOT NULL DEFAULT '',
  marital_status TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  discharged_at TEXT,
  discharge_note TEXT,
  updated_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients readable by anyone" ON public.patients FOR SELECT USING (true);
CREATE POLICY "patients insertable by anyone" ON public.patients FOR INSERT WITH CHECK (true);
CREATE POLICY "patients updatable by anyone" ON public.patients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "patients deletable by anyone" ON public.patients FOR DELETE USING (true);