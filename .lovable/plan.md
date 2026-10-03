# Replace authentication: username + password, admin approval, email recovery

## Conflicts found (and how the plan resolves them)

1. **No `profiles` / `user_roles` / `login_name` exist yet.** The backend only has `patients`, `chat_threads`, `chat_messages`. They will be created (not "kept").
2. **Synthetic email + reset emails don't mix on Lovable Cloud without a domain.** Lovable's custom email sending (generateLink + send) requires a verified sender domain the user owns — none is configured. The built-in default auth emails DO work free, but only to the auth user's own email.
   **Chosen approach:** the auth user's email *is* the real recovery email; the username lives in `profiles.login_name`. The user still never types an email to log in:
   - Login: a server function receives username + password, looks up the email with the service role, signs in server-side, and returns only the session tokens (client calls `setSession`). The email never reaches the client. Wrong username and wrong password return the same generic error.
   - Recovery: server function looks up the email and calls `resetPasswordForEmail(..., redirectTo /reset-password)`; always returns the generic message.
   - Note: default auth emails have a low hourly limit and generic Lovable branding. Branded emails later need a domain.
   - Sign-up will turn on auto-confirm so the account is usable immediately (admin approval is the real gate). Confirm-by-email would otherwise be required first.
3. **Offline Electron vs. mandatory login.** A hard online check would make the laptop build unusable without internet. Plan: the laptop app needs internet for the **first** login; after that the saved session (and the cached "approved" flag) unlocks it offline. Sign-out, sign-up, recovery and user admin need internet. The build stays green (server-only modules already stubbed).
4. **Local data on the device.** Patients live locally and sync to the cloud. Unapproved users get a "بانتظار موافقة المشرف" screen instead of the app, so they can't see local data either.
5. **Existing staff accounts** were created with real emails on /login. Migration gives each one a `login_name` taken from the part of the email before `@` (cleaned, made unique with a number suffix), marks them approved, and makes the oldest one admin. I'll list the generated usernames for you afterwards.

## What will be built

- **/login** (Arabic RTL card, same style): username + password, links "إنشاء حساب" and "نسيت كلمة السر؟".
- **Sign-up**: username, display name, password + confirm, recovery email (required). First account ever → admin + approved; others wait for approval.
- **Pending screen** for unapproved accounts, with logout.
- **/reset-password** (public): set new password + confirm (min 8).
- **إدارة المستخدمين** page (admins only): list users, approve / revoke, see pending.
- **App shell**: logout button; the lock button becomes "تغيير كلمة السر" (current + new + confirm).
- **Remove device lock**: AppLock.tsx deleted, its storage keys cleared on startup.
- Every page except `/print*`, `/login`, `/reset-password`, `/.lovable/oauth*` requires sign-in.

## Technical details

- Migration:
  - `app_role` enum, `user_roles` (+ `has_role`), `profiles(id → auth user, login_name, display_name, approved default false)`, unique index on `lower(login_name)`, check `^[A-Za-z0-9_]{3,30}$`.
  - Recovery email = `auth.users.email` (never in a public table) — no `profile_private` needed.
  - Security-definer `is_approved(uid)`; trigger on new auth user creates profile from signup metadata, first user → admin + approved.
  - Profiles RLS: own row read/update (cannot change `approved`, enforced by trigger); admins read/update all.
  - **Patients RLS replaced**: drop the four "anyone" policies; authenticated + `is_approved(auth.uid())` for read/insert/update/delete; revoke anon. (This also fixes the open security finding.)
  - Backfill existing users as described above.
- Server functions (`src/lib/auth.functions.ts`, zod-validated): `signInWithUsername`, `signUpWithUsername` (checks username free, creates via admin API with email_confirm), `requestPasswordReset`, `listUsers` / `setApproved` (admin check via `has_role` first).
- Auth gate in `__root`/AppShell: client-side session check (`ssr: false` style), redirect to `/login`; approved flag cached for offline use in Electron.
- Cloud sync and assistant use the signed-in session (no anon access left).
- Electron config: stub the new server functions with "يتطلب اتصال بالإنترنت".
- Update README, roadmap.md, AGENTS.md.

## Out of scope
- SMS recovery. Branded/custom-domain emails.
