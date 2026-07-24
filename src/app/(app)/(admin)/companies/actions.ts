"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveCompany(id: string | undefined, name: string) {
  const supabase = await createClient();
  const query = id
    ? supabase.from("companies").update({ name }).eq("id", id)
    : supabase.from("companies").insert({ name });
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/companies");
  return {};
}
