<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits pushed to the connected branch sync back to Lovable. Keep changes
> staged in reviewable branches and do not claim production verification without
> actually testing the deployed application.
<!-- LOVABLE:END -->

## Product direction
- This is an online-only web app. Do not add Electron packaging or offline clinical workflows.
- Clinical records and civil-ID documents belong in Supabase/Lovable Cloud. Do not persist clinical records in IndexedDB, localStorage, sessionStorage, service-worker caches, or offline queues.
- Supabase auth must use a custom in-memory storage adapter. Closing or refreshing the tab must require a new sign-in.
- On network loss, prevent writes and show: `لا يوجد اتصال بالإنترنت، يرجى إعادة المحاولة`.
- Add `Cache-Control: no-store` for sensitive HTML/API responses where supported by the hosting runtime.
- Enforce approved-staff access through Supabase Auth and RLS. Verify every clinical table and storage bucket policy before release.
- Civil-ID images remain in the private `civil-ids` bucket, with temporary signed URLs and printing at `/print/$patientId/civilid`. Do not weaken access controls.
- Do not delete or overwrite legacy local clinical data until the owner confirms whether it must be migrated to the cloud. Never claim the app is fully cloud-only while Dexie/local persistence or sync code remains.
