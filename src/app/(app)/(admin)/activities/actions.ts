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

export interface NewsFields {
  title: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string | null;
  startDate: string;
  endDate: string;
}

export async function saveNews(id: string | undefined, fields: NewsFields) {
  const supabase = await createClient();
  const payload = {
    title: fields.title,
    description: fields.description,
    image_url: fields.imageUrl,
    link_url: fields.linkUrl,
    start_date: fields.startDate,
    end_date: fields.endDate,
  };
  const query = id
    ? supabase.from("company_news").update(payload).eq("id", id)
    : supabase.from("company_news").insert(payload);
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/activities");
  revalidatePath("/");
  return {};
}

export async function deleteNews(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("company_news").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/activities");
  revalidatePath("/");
  return {};
}
