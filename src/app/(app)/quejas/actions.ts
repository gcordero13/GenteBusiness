"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface UpdateComplaintStatusResult {
  error?: string;
}

export async function updateComplaintStatus(
  id: string,
  status: string,
  comment: string,
): Promise<UpdateComplaintStatusResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_complaint_status", {
    p_id: id,
    p_status: status,
    p_comment: comment,
  });
  if (error) return { error: error.message };

  revalidatePath("/quejas");
  return {};
}
