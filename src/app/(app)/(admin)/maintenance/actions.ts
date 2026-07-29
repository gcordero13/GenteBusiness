"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateMaintenanceToken } from "@/lib/maintenanceToken";

interface ActionResult {
  error?: string;
  token?: string;
}

export async function createMaintenanceRecord(contactId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("first_name, last_name, position, email, companies(name), departments(name)")
    .eq("id", contactId)
    .single();
  if (contactError || !contact) return { error: "Contacto no encontrado" };

  const token = generateMaintenanceToken();

  const { error: insertError } = await supabase.from("maintenance_records").insert({
    token,
    contact_id: contactId,
    created_by: user.id,
    first_name: contact.first_name,
    last_name: contact.last_name,
    position: contact.position,
    email: contact.email,
    company_name: (contact.companies as unknown as { name: string } | null)?.name ?? null,
    department_name: (contact.departments as unknown as { name: string } | null)?.name ?? null,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/maintenance");
  return { token };
}

export async function deleteMaintenanceRecord(recordId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_records")
    .delete()
    .eq("id", recordId)
    .eq("status", "pendiente");
  if (error) return { error: error.message };

  revalidatePath("/maintenance");
  return {};
}
