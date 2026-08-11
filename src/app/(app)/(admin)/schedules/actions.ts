"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SaveCompanyScheduleInput {
  start_time: string;
  end_time: string;
  workdays: number[];
  tolerance_minutes: number;
}

interface ActionResult {
  error?: string;
}

async function callerCanManageSchedules(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "schedules" });
  return Boolean(data?.[0]?.can_manage);
}

export async function saveCompanySchedule(
  input: SaveCompanyScheduleInput,
): Promise<ActionResult> {
  if (!(await callerCanManageSchedules())) {
    return { error: "No autorizado" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_schedule")
    .update({
      start_time: input.start_time,
      end_time: input.end_time,
      workdays: input.workdays,
      tolerance_minutes: input.tolerance_minutes,
    })
    .eq("id", true);

  if (error) return { error: error.message };

  revalidatePath("/schedules");
  return {};
}
