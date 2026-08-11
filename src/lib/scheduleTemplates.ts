import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_SCHEDULE, type ScheduleTemplate } from "./schedules";

export interface ScheduleTemplatesContext {
  schedulesById: Map<string, ScheduleTemplate>;
  defaultSchedule: ScheduleTemplate;
}

export async function getScheduleTemplatesContext(): Promise<ScheduleTemplatesContext> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_templates")
    .select("id, name, tolerance_minutes, is_default, schedule_template_days(day_of_week, start_time, end_time)");

  if (error) {
    console.error("getScheduleTemplatesContext: failed to fetch schedule_templates:", error.message);
  }

  const rows = data ?? [];
  const templates: ScheduleTemplate[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    tolerance_minutes: t.tolerance_minutes,
    days: (t.schedule_template_days ?? []).map((d) => ({
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  }));

  const schedulesById = new Map<string, ScheduleTemplate>(templates.map((t) => [t.id, t]));
  const defaultRow = rows.find((t) => t.is_default);
  const defaultSchedule = (defaultRow && schedulesById.get(defaultRow.id)) ?? FALLBACK_SCHEDULE;

  return { schedulesById, defaultSchedule };
}
