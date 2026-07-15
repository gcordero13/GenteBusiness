"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { escapeIlikePattern } from "@/lib/contacts";
import { toCsv } from "@/lib/csv";

export interface ContactInput {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  extension: string;
  fleet_phone: string;
  has_whatsapp: boolean;
  company_id: string;
  department_id: string;
  position: string;
  birth_date: string;
  reports_to_id: string;
  photo_url: string;
}

export async function saveContact(input: ContactInput) {
  const supabase = await createClient();
  const { id, ...fields } = input;
  const payload = {
    ...fields,
    email: fields.email || null,
    extension: fields.extension || null,
    fleet_phone: fields.fleet_phone || null,
    birth_date: fields.birth_date || null,
    company_id: fields.company_id || null,
    department_id: fields.department_id || null,
    reports_to_id: fields.reports_to_id || null,
    photo_url: fields.photo_url || null,
  };

  const query = id
    ? supabase.from("contacts").update(payload).eq("id", id)
    : supabase.from("contacts").insert(payload);

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function setContactStatus(id: string, status: "active" | "deactivated") {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return {};
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contacts");
  redirect("/contacts");
}

export interface ExportContactsFilters {
  q?: string;
  company?: string;
  department?: string;
  showInactive?: string;
}

const CSV_HEADER = [
  "first_name", "last_name", "email", "extension", "fleet_phone", "has_whatsapp",
  "position", "company", "department", "birth_date", "status", "photo_url",
];

export async function exportContactsCsv(filters: ExportContactsFilters) {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    return { error: "No autorizado" };
  }

  let query = supabase
    .from("contacts")
    .select(
      "first_name, last_name, email, extension, fleet_phone, has_whatsapp, position, birth_date, status, photo_url, companies(name), departments(name)",
    )
    .order("first_name");

  if (!filters.showInactive || !(flags.can_deactivate || flags.can_delete)) {
    query = query.eq("status", "active");
  }
  if (filters.q) {
    const pattern = escapeIlikePattern(filters.q);
    query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }
  if (filters.company) {
    query = query.eq("company_id", filters.company);
  }
  if (filters.department) {
    query = query.eq("department_id", filters.department);
  }

  const { data: contacts, error } = await query;
  if (error) return { error: error.message };

  const rows: (string | number | boolean | null)[][] = [CSV_HEADER];
  for (const c of contacts ?? []) {
    const company = (c.companies as unknown as { name: string } | null)?.name ?? "";
    const department = (c.departments as unknown as { name: string } | null)?.name ?? "";
    rows.push([
      c.first_name,
      c.last_name,
      c.email ?? "",
      c.extension ?? "",
      c.fleet_phone ?? "",
      c.has_whatsapp,
      c.position ?? "",
      company,
      department,
      c.birth_date ?? "",
      c.status,
      c.photo_url ?? "",
    ]);
  }

  return { csv: toCsv(rows) };
}
