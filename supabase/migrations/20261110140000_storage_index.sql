-- Storage index (docs/superpowers/specs/2026-11-10-storage-design.md §5). Content is end-to-end encrypted
-- on the device; these rows only say where each encrypted object lives.

-- private schema: helpers that must not be exposed through the REST API
create schema if not exists private;

create table public.notebooks_idx (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '',
  kind text not null default 'notebook',
  version integer not null default 0,
  manifest_object uuid,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index notebooks_idx_owner on public.notebooks_idx (owner_id, updated_at);
alter table public.notebooks_idx enable row level security;
create policy "own notebooks select" on public.notebooks_idx for select to authenticated using (owner_id = (select auth.uid()));
create policy "own notebooks insert" on public.notebooks_idx for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own notebooks update" on public.notebooks_idx for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own notebooks delete" on public.notebooks_idx for delete to authenticated using (owner_id = (select auth.uid()));

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  sha256 text not null,
  bytes bigint not null check (bytes >= 0),
  provider text not null check (provider in ('supabase', 'telegram', 'pinata', 'filebase')),
  wrapped_key bytea not null,
  chunks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, sha256)
);
create index objects_owner on public.objects (owner_id);
alter table public.objects enable row level security;
create policy "own objects select" on public.objects for select to authenticated using (owner_id = (select auth.uid()));
create policy "own objects insert" on public.objects for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own objects delete" on public.objects for delete to authenticated using (owner_id = (select auth.uid()));

-- Supabase Storage tier: private bucket, one folder per user, 50 MB per user (then the app falls back to Telegram)
insert into storage.buckets (id, name, public, file_size_limit)
values ('blobs', 'blobs', false, 20971520)
on conflict (id) do nothing;

create function private.storage_bytes_used(uid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'blobs' and (storage.foldername(o.name))[1] = uid::text
$$;
revoke all on function private.storage_bytes_used(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.storage_bytes_used(uuid) to authenticated;

create policy "own blobs read" on storage.objects for select to authenticated
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own blobs write under quota" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'blobs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.storage_bytes_used((select auth.uid())) < 52428800
  );
create policy "own blobs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- advisor 0028/0029: this pre-existing helper was callable by anyone
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
