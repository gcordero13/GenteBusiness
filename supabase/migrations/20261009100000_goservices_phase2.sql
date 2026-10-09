-- 1. Persist SharePoint driveId/itemId (not just the webUrl) for each
-- attachment, so a server-side proxy can fetch a fresh, short-lived Graph
-- download URL on demand instead of storing one directly (those expire).
alter table public.goservices_requests
  add column foto_drive_id text,
  add column foto_item_id text,
  add column documento_drive_id text,
  add column documento_item_id text;

-- 2. can_add on the goservices module now means "eligible to be assigned a
-- request" (ejecutor), reusing the existing role_profile_permissions column
-- rather than a new table. Give Super Admin this by default so the feature
-- is testable immediately with the one role profile the original migration
-- already granted can_view to.
update public.role_profile_permissions rpp
set can_add = true
from public.modules m, public.role_profiles rp
where rpp.module_id = m.id
  and rpp.role_profile_id = rp.id
  and m.key = 'goservices'
  and rp.name = 'Super Admin';
