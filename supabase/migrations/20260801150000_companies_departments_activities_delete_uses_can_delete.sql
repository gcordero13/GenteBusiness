-- Deletion for companies/departments/activities was gated on can_manage,
-- conflating "manage this module" with "delete a row in it". Realign to
-- can_delete, matching the precedent already used by contacts and
-- maintenance — a role can manage a module's records without necessarily
-- being allowed to delete them.
drop policy "companies_delete_platform_managers" on public.companies;
create policy "companies_delete_platform_managers" on public.companies
for delete
using ( coalesce((select can_delete from public.get_my_module_permissions('companies')), false) );

drop policy "departments_delete_platform_managers" on public.departments;
create policy "departments_delete_platform_managers" on public.departments
for delete
using ( coalesce((select can_delete from public.get_my_module_permissions('departments')), false) );

drop policy "company_events_delete_platform_managers" on public.company_events;
create policy "company_events_delete_platform_managers" on public.company_events
for delete
using ( coalesce((select can_delete from public.get_my_module_permissions('activities')), false) );
