# OpenNote: Auth task brief (F1 sign-in)

You are an AI coding agent. Your job is to add **optional sign-in** to OpenNote with Supabase Auth. This file has everything you need. Read all of it before you start.

Another agent is building Batch C (audio + transcription) and the sync tables at the same time. Stay inside the files listed in section 4 so your work doesn't clash with theirs.

---

## 1. The app

- **OpenNote** is a free, offline-first notebook app like Goodnotes, for web, Android (APK) and Windows (EXE).
- Repo: `C:\Users\begin\Projects\strata` (the folder name is old). GitHub: `Archemasachika7/opennote`, branch `master`.
- Stack: React 18.3.1 + TypeScript + Vite 8, Dexie 4 (IndexedDB), motion/react, Capacitor 8 (Android, app id `app.opennote.notes`), Tauri 2 (Windows).
- UI pieces you can reuse: `src/ui/Sheet.tsx`, `src/ui/Button.tsx`, `src/ui/Toast.tsx`, `src/ui/Menu.tsx`, tokens in `src/ui/tokens.css`, motion tokens in `src/ui/motion.ts`.
- Platform helpers: `src/platform/` (`web.ts`, `capacitor.ts`, `port.ts`).

## 2. Hard rules (must follow)

1. **No purple in the app design.** `tests/unit/no-purple.test.ts` fails the build if the words purple, violet, indigo or magenta appear anywhere in `src/`, even in comments. Accent colour: amber `var(--accent)` (`#f5a524`).
2. **Use motion/react** with the tokens in `src/ui/motion.ts`, and respect reduced motion.
3. **Free only.** No paid services or plans.
4. **Accounts are optional.** Everything must keep working signed out and offline, exactly as today.
5. **Only the publishable key goes in the client.** Never use or commit the `service_role` key.
6. **RLS is on for every table** you create.
7. **TDD:** write the failing test first, then the code.
8. AI keys (Gemini, Sarvam) are not your concern and must never be sent to Supabase.

## 3. Supabase project

| Item | Value |
|---|---|
| Project ref | `etlbgckvkjmeftvsbhqr` |
| Org | `pcoptpswsjpdxwehcevl` |
| URL | `https://etlbgckvkjmeftvsbhqr.supabase.co` |
| Publishable key | `sb_publishable_PkNmkAnoG9YaCwU0-2bsnQ_Qp0BGEgZ` (public, safe in the client) |
| State on 2026-11-10 | empty: no tables, no buckets |

Put these in `.env.local` (git-ignored; add `.env.local` to `.gitignore` if it's missing):

```
VITE_SUPABASE_URL=https://etlbgckvkjmeftvsbhqr.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_PkNmkAnoG9YaCwU0-2bsnQ_Qp0BGEgZ
```

If the env vars are missing, the app must hide the sign-in button and not crash.

## 4. Scope: what you own

**You may create or edit:**
- `src/sync/supabase.ts`: the client (`createClient` with `auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }`). Export `null` when env vars are missing.
- `src/sync/auth.ts`: `sendCode(email)`, `verifyCode(email, code)`, `signInWithGoogle()`, `signOut()`, `onAuthChange(cb)`, plus a small hook `useAuth()` that returns `{ status: 'disabled' | 'signed-out' | 'code-sent' | 'signed-in', user }`.
- `src/ui/AccountSheet.tsx`: the sign-in / account sheet.
- **One small change** to add an account button (person icon from `lucide-react`) in the library top bar. Find it from `src/App.tsx` / `src/library/`. Keep the diff minimal.
- `supabase/migrations/<timestamp>_profiles.sql` (see section 7).
- Android deep link: `android/app/src/main/AndroidManifest.xml` intent filter, plus `@capacitor/app` and `@capacitor/browser`.
- Windows: OTP code only for now (no deep-link plugin needed).
- Tests: `tests/unit/auth.test.ts(x)`, `tests/e2e/auth.spec.ts`.
- `package.json` / `package-lock.json`: add `@supabase/supabase-js@2`, `@capacitor/app`, `@capacitor/browser`.

**Do not touch:** `src/store/schema.ts` (the Dexie version bump belongs to the other agent), any sync or data tables, `src/notebook/`, `src/ink/`, `src/board/`, `src/study/`, `src/live/`, `.github/workflows/`.

## 5. Sign-in methods

| Method | Notes |
|---|---|
| **Email 6-digit code (main)** | `signInWithOtp({ email, options: { shouldCreateUser: true } })` then `verifyOtp({ email, token, type: 'email' })`. Works the same on web, APK and EXE because nothing has to redirect back. |
| **Google (optional button)** | `signInWithOAuth({ provider: 'google', options: { redirectTo } })`. Show it only on web and Android. The user must create the Google OAuth client and turn on the provider in the dashboard; write the steps in your final message and don't block on it. |

To get a 6-digit code instead of a link, the email template "Magic Link" must include `{{ .Token }}`. Tell the user to change it in Dashboard → Auth → Email Templates.

## 6. Redirect URLs (Google only)

| Platform | Redirect |
|---|---|
| Web dev | `http://localhost:5173/auth/callback` |
| Web prod | `<hosted URL>/auth/callback` |
| Android | `app.opennote.notes://auth-callback`: open with `Browser.open`, catch it with `App.addListener('appUrlOpen')`, then `exchangeCodeForSession(code)` and `Browser.close()` |

Add these under Dashboard → Auth → URL Configuration.

## 7. Migration

Apply it with the Supabase MCP `apply_migration` if you have it, or ask the user to paste it into the SQL editor.

```sql
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select using (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Afterwards, run the MCP `get_advisors` (type `security`). It must show zero warnings.

## 8. UI (AccountSheet)

- Signed out: an email field → "Send code" → a 6-digit code field → "Sign in". Optional "Continue with Google" button. One line of text: "Optional. Sign in to sync and share later. Your notes stay on this device."
- Signed in: the email, a "Sign out" button, and a "Sync: coming soon" note.
- Errors go to `Toast`. Use the existing dark theme and amber accent, and animate the sheet with the motion tokens.

## 9. Tests (write first)

- Unit, with the Supabase client mocked: the state flow disabled / signed-out → code-sent → signed-in → signed-out.
- Unit: invalid email blocks "Send code"; a code that isn't 6 digits blocks "Sign in".
- Unit: with no env vars, the account button is hidden and the app renders.
- Unit: no `service_role` text in `src/`.
- e2e (`npx playwright test`, Chrome, port 5199): the sheet opens from the library, the email validates, and closing it leaves the app usable signed out. Don't send real emails in tests.

## 10. Done means

Run these in `C:\Users\begin\Projects\strata` (bash) and check the **exit codes**, not just the counts:

```
npx vitest run          # all 234+ existing tests still pass, plus yours
npx playwright test     # all 12+ e2e pass
npx tsc -p .
npm run build
```

Work on branch `f1-auth`. Commit with clear messages. **Don't merge to master or push.** The user will review and merge.

Final message to the user, short:
- what you built and the test results;
- the dashboard steps left for them (email template `{{ .Token }}`, Google provider, redirect URLs).
