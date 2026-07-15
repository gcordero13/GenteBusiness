"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createActivity(name: string, eventDate: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("company_events").insert({ name, event_date: eventDate });
  if (error) return { error: error.message };
  revalidatePath("/activities");
  revalidatePath("/contacts");
  return {};
}
