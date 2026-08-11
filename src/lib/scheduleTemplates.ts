import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_SCHEDULE, type ScheduleTemplate } from "./schedules";

export interface ScheduleTemplatesContext {
  schedulesById: Map<string, ScheduleTemplate>;
  defaultSchedule: ScheduleTemplate;
}

export async function getScheduleTemplatesContext(): Promise<ScheduleTemplatesContext> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_templates")
    .select("id, name, tolerance_minutes, is_default, schedule_template_days(day_of_week, start_time, end_time)");

  const templates: (ScheduleTemplate & { is_default: boolean })[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    tolerance_minutes: t.tolerance_minutes,
    is_default: t.is_default,
    days: (t.schedule_template_days ?? []).map((d) => ({
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  }));

  const schedulesById = new Map<string, ScheduleTemplate>(templates.map((t) => [t.id, t]));
  const defaultSchedule = templates.find((t) => t.is_default) ?? FALLBACK_SCHEDULE;

  return { schedulesById, defaultSchedule };
}
