create unique index contacts_hikvision_employee_no_unique
  on public.contacts (hikvision_employee_no)
  where hikvision_employee_no is not null;
