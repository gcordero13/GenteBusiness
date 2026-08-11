export interface CompanySchedule {
  start_time: string;
  end_time: string;
  workdays: number[];
  tolerance_minutes: number;
}

export const DEFAULT_COMPANY_SCHEDULE: CompanySchedule = {
  start_time: "08:00:00",
  end_time: "17:00:00",
  workdays: [1, 2, 3, 4, 5],
  tolerance_minutes: 0,
};

export interface ScheduleOverrideFields {
  schedule_start_time: string | null;
  schedule_end_time: string | null;
  schedule_workdays: number[] | null;
  schedule_tolerance_minutes: number | null;
}

// Only schedule_start_time is checked. The contact form enforces an
// all-or-nothing rule (all four fields set together, or none), so in
// practice this is equivalent to checking all four. If schedule_start_time
// is null - even if a sibling field is unexpectedly set (e.g. edited
// directly in the database) - this falls back entirely to the company
// default rather than mixing the present sibling field with defaults for
// the rest.
export function getEffectiveSchedule(
  override: ScheduleOverrideFields,
  companyDefault: CompanySchedule,
): CompanySchedule {
  if (!override.schedule_start_time) {
    return companyDefault;
  }
  return {
    start_time: override.schedule_start_time,
    end_time: override.schedule_end_time as string,
    workdays: override.schedule_workdays as number[],
    tolerance_minutes: override.schedule_tolerance_minutes as number,
  };
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

export function formatWorkdays(workdays: number[]): string {
  const sorted = [...workdays].sort((a, b) => a - b);
  const isContiguousRange =
    sorted.length > 1 && sorted.every((day, i) => i === 0 || day === sorted[i - 1] + 1);

  if (isContiguousRange) {
    return capitalize(`${DAY_NAMES_ES[sorted[0]]} a ${DAY_NAMES_ES[sorted[sorted.length - 1]]}`);
  }

  return capitalize(sorted.map((day) => DAY_NAMES_ES[day]).join(", "));
}

export function formatScheduleLine(schedule: CompanySchedule): string {
  return `${formatWorkdays(schedule.workdays)}, ${formatScheduleTime(schedule.start_time)} – ${formatScheduleTime(schedule.end_time)}`;
}
