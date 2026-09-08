"use server";

import { createClient } from "@/lib/supabase/server";

export interface SubmitComplaintInput {
  category: string;
  message: string;
  isAnonymous: boolean;
}

interface SubmitComplaintResult {
  error?: string;
}

export async function submitComplaint(input: SubmitComplaintInput): Promise<SubmitComplaintResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  if (!input.message.trim()) return { error: "El mensaje no puede estar vacío" };

  const { error } = await supabase.rpc("submit_complaint", {
    p_category: input.category,
    p_message: input.message,
    p_is_anonymous: input.isAnonymous,
  });
  if (error) return { error: error.message };

  return {};
}
