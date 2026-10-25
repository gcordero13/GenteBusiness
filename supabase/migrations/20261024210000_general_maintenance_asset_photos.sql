-- Lets the Servicios Generales team upload a real photo for an asset
-- (a vehicle, an A/C unit, etc.) instead of only a text spec - confirmed
-- with the user ("subir archivo real"). Stored in SharePoint via the same
-- mechanism GoServices already uses for its photo attachments (src/lib/
-- sharepoint.ts, uploadToSharePoint) instead of a separate Supabase
-- Storage bucket - confirmed with the user: every module should keep
-- photos in the same place. photo_url is the webUrl captured at upload
-- time (kept for reference, not used as an <img src> - it requires the
-- viewer's own Microsoft 365 session); the actual viewer route re-derives
-- a fresh download link from photo_drive_id/photo_item_id on each request
-- (see /api/servicios-generales/asset-photo/[driveId]/[itemId]).
--
-- photo_url already exists on this table (added by an earlier, since-
-- reworked version of this same migration file that used a Supabase
-- Storage bucket instead) - only the two new columns are needed now, and
-- that unused bucket/its policies are dropped below.
alter table public.general_maintenance_assets
  add column photo_drive_id text,
  add column photo_item_id text;

-- The bucket row itself is left in place - Supabase blocks deleting it via
-- plain SQL ("Direct deletion from storage tables is not allowed"); it's
-- empty and harmless, delete it later from Dashboard -> Storage if desired.
drop policy if exists "asset_photos_public_read" on storage.objects;
drop policy if exists "asset_photos_write_managers" on storage.objects;
drop policy if exists "asset_photos_update_managers" on storage.objects;
drop policy if exists "asset_photos_delete_managers" on storage.objects;
