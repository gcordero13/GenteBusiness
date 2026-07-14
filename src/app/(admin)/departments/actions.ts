"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createDepartment(name: string, companyId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ name, company_id: companyId });
  if (error) return { error: error.message };
  revalidatePath("/departments");
  return {};
}
