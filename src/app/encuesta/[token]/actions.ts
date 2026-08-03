"use server";

import { createAdminClient } from "@/lib/supabase/admin";

interface ActionResult {
  error?: string;
}

export interface SurveyResponseInput {
  quality_score: number;
  professionalism_score: number;
  clarity_score: number;
  satisfaction_score: number;
  comments: string;
}

export async function submitSurveyResponse(token: string, input: SurveyResponseInput): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("maintenance_surveys")
    .select("id, status")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return { error: "Enlace inválido o expirado" };
  if (data.status === "respondida") return { error: "Esta encuesta ya fue respondida" };

  const { error: updateError } = await admin
    .from("maintenance_surveys")
    .update({
      status: "respondida",
      responded_at: new Date().toISOString(),
      quality_score: input.quality_score,
      professionalism_score: input.professionalism_score,
      clarity_score: input.clarity_score,
      satisfaction_score: input.satisfaction_score,
      comments: input.comments || null,
    })
    .eq("id", data.id);
  if (updateError) return { error: updateError.message };

  return {};
}
