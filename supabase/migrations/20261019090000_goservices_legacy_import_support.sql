-- Supports importing ~1,680 historical GoServices tickets from the old
-- SharePoint-based system. requester_app_user_id was NOT NULL, but ~350
-- of those tickets belong to requesters with no app_users account today
-- (shared mailboxes, people from other companies, departed employees) -
-- rather than creating fake login accounts just to satisfy the FK, the
-- column becomes nullable and requester_email captures their identity as
-- plain text for historical records. legacy_ticket_number preserves the
-- original ticket # from the old system for reference/search, since the
-- live request_number sequence (an identity column) can't be rewound to
-- match it without colliding with tickets already created in production.
alter table public.goservices_requests
  alter column requester_app_user_id drop not null,
  add column requester_email text,
  add column legacy_ticket_number integer;

create index goservices_requests_legacy_ticket_number_idx
  on public.goservices_requests(legacy_ticket_number);
