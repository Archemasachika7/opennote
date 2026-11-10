-- Storage settings (Telegram bot token, Pinata key) shared across a user's devices.
-- Encrypted on the device with the sync master key (iv ‖ AES-GCM), so the server can't read them.
-- Covered by the existing "read own profile" / "update own profile" RLS policies.
alter table public.profiles add column storage_settings bytea;
