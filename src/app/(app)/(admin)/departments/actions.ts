"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveDepartment(id: string | undefined, name: string, companyId: string) {
  const supabase = await createClient();
  const query = id
    ? supabase.from("departments").update({ name, company_id: companyId }).eq("id", id)
    : supabase.from("departments").insert({ name, company_id: companyId });
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/departments");
  return {};
}
