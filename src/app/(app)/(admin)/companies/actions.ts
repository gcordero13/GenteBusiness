"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveCompany(id: string | undefined, name: string, logoUrl: string | null) {
  const supabase = await createClient();
  const query = id
    ? supabase.from("companies").update({ name, logo_url: logoUrl }).eq("id", id)
    : supabase.from("companies").insert({ name, logo_url: logoUrl });
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/companies");
  return {};
}
