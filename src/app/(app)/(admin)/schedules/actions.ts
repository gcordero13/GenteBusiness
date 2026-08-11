"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ScheduleDayInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface SaveScheduleTemplateInput {
  id?: string;
  name: string;
  tolerance_minutes: number;
  is_default: boolean;
  days: ScheduleDayInput[];
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

export async function saveScheduleTemplate(input: SaveScheduleTemplateInput): Promise<ActionResult> {
  if (!(await callerCanManageSchedules())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();

  if (!input.is_default) {
    const { count } = await admin
      .from("schedule_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_default", true)
      .neq("id", input.id ?? "");
    if (!count) {
      return { error: "No se puede quitar el horario predeterminado sin marcar otro primero." };
    }
  }

  if (input.is_default) {
    const { error: unsetError } = await admin
      .from("schedule_templates")
      .update({ is_default: false })
      .eq("is_default", true);
    if (unsetError) return { error: unsetError.message };
  }

  const payload = {
    name: input.name,
    tolerance_minutes: input.tolerance_minutes,
    is_default: input.is_default,
  };

  let scheduleId = input.id;
  if (scheduleId) {
    const { error } = await admin.from("schedule_templates").update(payload).eq("id", scheduleId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await admin.from("schedule_templates").insert(payload).select("id").single();
    if (error) return { error: error.message };
    scheduleId = data.id;
  }

  const { error: deleteDaysError } = await admin
    .from("schedule_template_days")
    .delete()
    .eq("schedule_template_id", scheduleId);
  if (deleteDaysError) return { error: deleteDaysError.message };

  if (input.days.length > 0) {
    const { error: insertDaysError } = await admin.from("schedule_template_days").insert(
      input.days.map((d) => ({
        schedule_template_id: scheduleId,
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
      })),
    );
    if (insertDaysError) return { error: insertDaysError.message };
  }

  revalidatePath("/schedules");
  return {};
}

export async function deleteScheduleTemplate(id: string): Promise<ActionResult> {
  if (!(await callerCanManageSchedules())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { data: schedule } = await admin.from("schedule_templates").select("is_default").eq("id", id).single();
  if (schedule?.is_default) {
    return {
      error: "No se puede eliminar el horario marcado como predeterminado. Marca otro horario como predeterminado primero.",
    };
  }

  const { error } = await admin.from("schedule_templates").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/schedules");
  return {};
}
