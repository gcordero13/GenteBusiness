"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveActivity(id: string | undefined, name: string, eventDate: string) {
  const supabase = await createClient();
  const query = id
    ? supabase.from("company_events").update({ name, event_date: eventDate }).eq("id", id)
    : supabase.from("company_events").insert({ name, event_date: eventDate });
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/activities");
  revalidatePath("/contacts");
  return {};
}

export async function deleteActivity(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("company_events").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/activities");
  revalidatePath("/contacts");
  return {};
}
