# Ward 39 — Patient Management System

Ward 39 is an **online-only web application** for managing the Ward 39 patient registry. The web application uses Supabase/Lovable Cloud for clinical records and private document storage. It is not an Electron desktop application and does not support offline clinical data entry.

This project was built with [Lovable](https://lovable.dev).

## Development

Requirements: Node.js and npm.

```sh
git clone https://github.com/Abdallah-Sarhan/b-3up1.git
cd b-3up1
npm install
npm run dev
```

Production build and local preview:

```sh
npm run build
npm run preview
```

Configure the Supabase project URL and publishable key using the hosting environment's supported environment variables. Never expose a Supabase service-role key in browser code.

## Sign-in and access

Sign in with username and password. New accounts require administrator approval. Clinical data must only be available to approved staff through Supabase authentication and Row Level Security (RLS). The online web application requires an active internet connection.

The intended session policy is memory-only: refreshing or closing the tab requires signing in again. Do not persist authentication tokens or clinical records in browser storage.

## Civil ID documents

The front and back images of a patient's civil ID are intended to be uploaded to the private `civil-ids` storage bucket and linked through `patient_documents`. Access must be limited to approved staff, with temporary signed URLs used for viewing and printing at `/print/$patientId/civilid`. Verify the deployed storage policies before production use.

## Data safety

Clinical data must be read and written to Supabase directly. Do not add IndexedDB, browser persistence for clinical data (Supabase Auth session persistence is the only exception), offline queues, service-worker caches, or automatic local backups. Explicit user-requested export/import may read a selected file or produce a downloaded backup, but imported records must be written directly to Supabase and must never be queued locally. If the connection is lost, block writes and show: `لا يوجد اتصال بالإنترنت، يرجى إعادة المحاولة`.

Before publishing, validate database migrations, RLS policies for every clinical table, and policies for all storage buckets. A successful frontend build alone does not verify backend access controls.
