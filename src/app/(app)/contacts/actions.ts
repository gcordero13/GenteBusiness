"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { escapeIlikePattern } from "@/lib/contacts";
import { parseCsv, toCsv } from "@/lib/csv";
import { provisionContactLogin } from "@/lib/supabase/provisionContactLogin";

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

  await provisionContactLogin(payload.email);

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

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  successCount: number;
  errors: ImportRowError[];
}

export async function importContactsCsv(
  csvText: string,
): Promise<ImportResult | { error: string }> {
  const supabase = await createClient();

  const rows = parseCsv(csvText).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) {
    return { error: "El archivo está vacío" };
  }

  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const { data: companies } = await supabase.from("companies").select("id, name");
  const { data: departments } = await supabase.from("departments").select("id, name, company_id");

  const companyByName = new Map((companies ?? []).map((c) => [c.name.trim().toLowerCase(), c]));
  const departmentByName = new Map(
    (departments ?? []).map((d) => [`${d.company_id}:${d.name.trim().toLowerCase()}`, d]),
  );

  const errors: ImportRowError[] = [];
  let successCount = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const rowNumber = i + 2;
    const cells = dataRows[i];
    const get = (key: string) => {
      const idx = header.indexOf(key);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };

    const firstName = get("first_name");
    const lastName = get("last_name");
    if (!firstName || !lastName) {
      errors.push({ row: rowNumber, message: "Falta nombre o apellido" });
      continue;
    }

    const companyName = get("company");
    const company = companyName ? companyByName.get(companyName.toLowerCase()) : undefined;
    if (companyName && !company) {
      errors.push({ row: rowNumber, message: `Empresa "${companyName}" no encontrada` });
      continue;
    }

    const departmentName = get("department");
    let departmentId: string | null = null;
    if (departmentName) {
      const dept = company
        ? departmentByName.get(`${company.id}:${departmentName.toLowerCase()}`)
        : undefined;
      if (!dept) {
        errors.push({ row: rowNumber, message: `Departamento "${departmentName}" no encontrado` });
        continue;
      }
      departmentId = dept.id;
    }

    const email = get("email");
    const payload = {
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      extension: get("extension") || null,
      fleet_phone: get("fleet_phone") || null,
      has_whatsapp: ["true", "1", "si", "sí"].includes(get("has_whatsapp").toLowerCase()),
      position: get("position") || null,
      company_id: company?.id ?? null,
      department_id: departmentId,
      birth_date: get("birth_date") || null,
      status: get("status") === "deactivated" ? "deactivated" : "active",
    };

    let existingId: string | null = null;
    if (email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }

    const { error } = existingId
      ? await supabase.from("contacts").update(payload).eq("id", existingId)
      : await supabase.from("contacts").insert(payload);

    if (error) {
      errors.push({ row: rowNumber, message: error.message });
      continue;
    }

    await provisionContactLogin(payload.email);
    successCount += 1;
  }

  revalidatePath("/contacts");
  return { successCount, errors };
}
