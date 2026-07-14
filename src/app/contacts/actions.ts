"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
