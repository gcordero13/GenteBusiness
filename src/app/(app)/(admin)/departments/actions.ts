"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveDepartment(
  id: string | undefined,
  name: string,
  companyId: string,
  defaultScheduleId: string | null,
) {
  const supabase = await createClient();
  const payload = { name, company_id: companyId, default_schedule_id: defaultScheduleId };
  const query = id
    ? supabase.from("departments").update(payload).eq("id", id)
    : supabase.from("departments").insert(payload);
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/departments");
  return {};
}

export async function deleteDepartment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error: "No se puede eliminar: hay contactos asignados a este departamento. Reasígnalos o elimínalos primero.",
      };
    }
    return { error: error.message };
  }
  revalidatePath("/departments");
  return {};
}
