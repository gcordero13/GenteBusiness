"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCompany(name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({ name });
  if (error) return { error: error.message };
  revalidatePath("/companies");
  return {};
}
