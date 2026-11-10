-- Stores the SharePoint reference (driveId/itemId, same pattern GoServices
-- already uses for its own attachments) for the signed "constancia" PDF
-- generated automatically once RRHH gives the final approval.
alter table public.vacation_requests
  add column constancia_drive_id text,
  add column constancia_item_id text;
