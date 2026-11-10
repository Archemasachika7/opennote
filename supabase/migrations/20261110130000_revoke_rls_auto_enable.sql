-- Security advisor 0028/0029: rls_auto_enable() was callable by anon/authenticated as SECURITY DEFINER.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
