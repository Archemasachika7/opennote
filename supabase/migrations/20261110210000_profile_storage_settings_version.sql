-- Version for profiles.storage_settings: a device only writes if the version is still the one it read,
-- so two devices changing storage settings at the same moment can't erase each other's change.
alter table public.profiles add column storage_settings_version integer not null default 0;
