-- Lets an admin mark, per person, which GoServices request type an
-- ejecutor (can_manage-eligible user) actually handles — confirmed with
-- the user: "el mensajero" and "el de mantenimiento" must be kept separate
-- so neither shows up as an assignment candidate for the other's tickets.
-- Null means "both" (the prior, unrestricted behavior), so existing
-- ejecutores are unaffected until an admin explicitly sets one.
alter table public.app_users
  add column goservices_ejecutor_type text
  check (goservices_ejecutor_type in ('mantenimiento', 'mensajeria'));
