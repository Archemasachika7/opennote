-- the server clock decides updated_at, so a device with a wrong clock can't make pulls skip changes
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger notebooks_idx_touch
  before insert or update on public.notebooks_idx
  for each row execute function private.touch_updated_at();
