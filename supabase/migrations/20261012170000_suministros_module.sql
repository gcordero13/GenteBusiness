-- Registers the new "Suministros" module, reusing the same generic
-- role_profile_permissions flags every other module in this app uses:
--   can_manage    = "despachador": prepares/dispatches approved requests
--                    and manages the article catalog (price, stock,
--                    low-stock threshold).
--   can_authorize = sees the spend-by-department report (finance/admin
--                    oversight). Approval itself is NOT a permission flag —
--                    confirmed with the user: anyone can be an approver if
--                    they appear in a requester's supervisor chain
--                    (contacts.reports_to_id), resolved at request time.
-- Creating a request is open to every authenticated user, same as
-- GoServices — no permission needed.
insert into public.modules (key, label) values ('suministros', 'Suministros');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, false, false, false, false, false, (rp.name = 'Super Admin'), (rp.name = 'Super Admin')
from public.role_profiles rp
cross join public.modules m
where m.key = 'suministros';
