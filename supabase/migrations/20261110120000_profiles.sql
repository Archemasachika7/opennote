-- F1: one profile row per user, created by trigger on sign-up.
-- kdf_salt / key_check hold the sync-passphrase salt and verifier (see docs/superpowers/specs/2026-11-10-storage-design.md §4).
-- They are not secrets: the passphrase and derived key never leave the device.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  kdf_salt bytea,
  key_check bytea,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

-- only the auth trigger may run it
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
