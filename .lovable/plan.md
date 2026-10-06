# Civil ID upload and print

## Conflicts with current code (decisions needed)
1. **Patient link key.** Patients live on the device with local numeric ids. The cloud copy is matched only by **file number** (`file_no`), and cloud sync skips patients that have no file number. Columns on the cloud `patients` table would be overwritten or lost by sync. **Decision:** use a separate `patient_documents` table keyed by `file_no` (one row per file number: front_path, back_path). Patients with no file number cannot have a Civil ID uploaded, and the app will say so.
2. **Deleting a patient** happens on the device. When online, the app also deletes that file number's images and row. When offline, the images stay in the cloud. The **"remove image"** action always works when online.
3. **Desktop (Electron) build** has no cloud access before sign-in. The section shows "يحتاج اتصالاً بالإنترنت" when offline.

## What gets built
- On the patient record page: a "البطاقة المدنية (Civil ID)" card with Front/Back slots. Each slot lets you upload (file or camera), see a thumbnail, replace the image, or delete it with a confirmation. It shows the privacy note.
- Images are resized in the browser to a max of 1600px as JPEG 0.8. Only jpg/png/webp up to 5 MB are accepted.
- A private `civil-ids` storage bucket, with paths `{file_no}/front-<ts>.jpg`. Images are shown through 5-minute signed URLs.
- A "طباعة البطاقة المدنية" button opens `/print/$patientId/civilid`. The page uses RTL A4 with the name and file number in the header. Front and back are stacked at about 171x108 mm (2x real size), with a print button and an empty-state message.
- Privacy: the assistant and MCP tools never touch this table or bucket. Images are left out of JSON backups and sync, and nothing is logged.

## Technical
- Migration: `patient_documents(file_no text pk, front_path, back_path, timestamps)`, GRANT to authenticated/service_role, RLS enabled, with all policies set to `is_approved(auth.uid())`. Storage policies on `storage.objects` for `bucket_id='civil-ids'` with select/insert/update/delete gated by `is_approved(auth.uid())`.
- New `src/lib/civil-id.ts` (compress, upload, signed URL, remove, removeAllForFileNo) and `src/components/CivilIdSection.tsx`.
- Print route `src/routes/print/$patientId/civilid.tsx`.
- Update README and the roadmap.
