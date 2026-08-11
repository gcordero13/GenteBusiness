export interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  tolerance_minutes: number;
  days: ScheduleDay[];
}

export const FALLBACK_SCHEDULE: ScheduleTemplate = {
  id: "__fallback__",
  name: "General",
  tolerance_minutes: 0,
  days: [1, 2, 3, 4, 5].map((day_of_week) => ({
    day_of_week,
    start_time: "08:00:00",
    end_time: "17:00:00",
  })),
};

// Resolution order: the contact's own override wins; otherwise the
// department's default wins; otherwise the passed-in default schedule
// (the schedule_templates row with is_default = true) wins. If an id
// points at a schedule that isn't in the map (e.g. stale data), this also
// falls back to the default rather than returning undefined.
export function getEffectiveSchedule(
  contactScheduleId: string | null,
  departmentDefaultScheduleId: string | null | undefined,
  schedulesById: Map<string, ScheduleTemplate>,
  defaultSchedule: ScheduleTemplate,
): ScheduleTemplate {
  const effectiveId = contactScheduleId ?? departmentDefaultScheduleId ?? defaultSchedule.id;
  return schedulesById.get(effectiveId) ?? defaultSchedule;
}

export function formatScheduleTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

const DAY_NAMES_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Groups days into maximal runs of consecutive day numbers that ALSO share
// identical start/end times, then joins each group with " · ". A schedule
// whose worked days wrap across the week boundary (e.g. Friday-Saturday-
// Sunday-Monday) won't be recognized as one contiguous range - a known,
// pre-existing limitation carried over from the original per-workday
// formatter, not worth solving for the schedules this app actually needs.
export function formatScheduleLine(schedule: ScheduleTemplate): string {
  if (schedule.days.length === 0) {
    return "Sin horario asignado";
  }

  const sorted = [...schedule.days].sort((a, b) => a.day_of_week - b.day_of_week);
  const groups: ScheduleDay[][] = [];
  for (const day of sorted) {
    const currentGroup = groups[groups.length - 1];
    const previousDay = currentGroup?.[currentGroup.length - 1];
    const continuesGroup =
      previousDay !== undefined &&
      day.day_of_week === previousDay.day_of_week + 1 &&
      day.start_time === previousDay.start_time &&
      day.end_time === previousDay.end_time;

    if (continuesGroup && currentGroup) {
      currentGroup.push(day);
    } else {
      groups.push([day]);
    }
  }

  return groups
    .map((group) => {
      const first = group[0];
      const last = group[group.length - 1];
      const dayLabel =
        group.length > 1
          ? `${DAY_NAMES_ES[first.day_of_week]} a ${DAY_NAMES_ES[last.day_of_week]}`
          : DAY_NAMES_ES[first.day_of_week];
      return `${capitalize(dayLabel)}, ${formatScheduleTime(first.start_time)} – ${formatScheduleTime(last.end_time)}`;
    })
    .join(" · ");
}

export function resolveScheduleLine(
  contactScheduleId: string | null,
  departmentDefaultScheduleId: string | null | undefined,
  schedulesById: Map<string, ScheduleTemplate>,
  defaultSchedule: ScheduleTemplate,
): string {
  return formatScheduleLine(
    getEffectiveSchedule(contactScheduleId, departmentDefaultScheduleId, schedulesById, defaultSchedule),
  );
}
