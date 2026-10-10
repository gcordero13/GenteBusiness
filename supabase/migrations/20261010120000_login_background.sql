-- Lets an admin (can_manage on settings) upload/change the login page's
-- background image from the Settings screen, same pattern as the existing
-- platform logo (same table, same company-logos bucket/platform/ prefix —
-- no new RLS policy needed, the existing platform_settings update policy
-- and storage.objects "platform" policies already cover any column/file
-- under that prefix for a settings manager).
alter table public.platform_settings add column login_background_url text;
