import { describe, expect, it } from "vitest";
import {
  formatScheduleLine,
  formatScheduleTime,
  getEffectiveSchedule,
  resolveScheduleLine,
  FALLBACK_SCHEDULE,
  type ScheduleTemplate,
} from "./schedules";

const general: ScheduleTemplate = {
  id: "general-id",
  name: "General",
  tolerance_minutes: 0,
  days: [
    { day_of_week: 1, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 2, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 3, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 4, start_time: "08:00:00", end_time: "17:00:00" },
    { day_of_week: 5, start_time: "08:00:00", end_time: "17:00:00" },
  ],
};

const ventas: ScheduleTemplate = {
  id: "ventas-id",
  name: "Ventas",
  tolerance_minutes: 0,
  days: [
    { day_of_week: 1, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 2, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 3, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 4, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 5, start_time: "09:00:00", end_time: "18:00:00" },
    { day_of_week: 6, start_time: "10:00:00", end_time: "14:00:00" },
  ],
};

describe("getEffectiveSchedule", () => {
  const schedulesById = new Map([
    [general.id, general],
    [ventas.id, ventas],
  ]);

  it("uses the contact's own override when set", () => {
    const result = getEffectiveSchedule(ventas.id, general.id, schedulesById, general);
    expect(result).toBe(ventas);
  });

  it("uses the department default when the contact has no override", () => {
    const result = getEffectiveSchedule(null, ventas.id, schedulesById, general);
    expect(result).toBe(ventas);
  });

  it("uses the global default when neither the contact nor the department has one set", () => {
    const result = getEffectiveSchedule(null, null, schedulesById, general);
    expect(result).toBe(general);
  });

  it("falls back to the passed-in default schedule if a referenced id isn't in the map", () => {
    const result = getEffectiveSchedule("missing-id", null, schedulesById, general);
    expect(result).toBe(general);
  });
});

describe("formatScheduleTime", () => {
  it("formats a morning time with am", () => {
    expect(formatScheduleTime("08:00:00")).toBe("8:00 am");
  });

  it("formats an afternoon time with pm", () => {
    expect(formatScheduleTime("17:00:00")).toBe("5:00 pm");
  });

  it("formats midnight as 12:00 am", () => {
    expect(formatScheduleTime("00:00:00")).toBe("12:00 am");
  });

  it("formats noon as 12:00 pm", () => {
    expect(formatScheduleTime("12:00:00")).toBe("12:00 pm");
  });

  it("zero-pads the minute", () => {
    expect(formatScheduleTime("09:05:00")).toBe("9:05 am");
  });
});

describe("formatScheduleLine", () => {
  it("groups a uniform weekday range and a separate Saturday block", () => {
    expect(formatScheduleLine(ventas)).toBe("Lunes a viernes, 9:00 am – 6:00 pm · Sábado, 10:00 am – 2:00 pm");
  });

  it("formats a schedule with no Saturday as just the weekday range", () => {
    expect(formatScheduleLine(general)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });

  it("formats a single worked day", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [{ day_of_week: 3, start_time: "08:00:00", end_time: "17:00:00" }],
    };
    expect(formatScheduleLine(schedule)).toBe("Miércoles, 8:00 am – 5:00 pm");
  });

  it("groups all seven days into one range when every day shares identical hours", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
        day_of_week,
        start_time: "08:00:00",
        end_time: "17:00:00",
      })),
    };
    expect(formatScheduleLine(schedule)).toBe("Domingo a sábado, 8:00 am – 5:00 pm");
  });

  it("does not merge days whose hours differ, even if consecutive", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [
        { day_of_week: 1, start_time: "08:00:00", end_time: "12:00:00" },
        { day_of_week: 2, start_time: "13:00:00", end_time: "17:00:00" },
      ],
    };
    expect(formatScheduleLine(schedule)).toBe("Lunes, 8:00 am – 12:00 pm · Martes, 1:00 pm – 5:00 pm");
  });

  it("sorts out-of-order input before grouping", () => {
    const schedule: ScheduleTemplate = {
      id: "x",
      name: "x",
      tolerance_minutes: 0,
      days: [
        { day_of_week: 5, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 1, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 3, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 2, start_time: "08:00:00", end_time: "17:00:00" },
        { day_of_week: 4, start_time: "08:00:00", end_time: "17:00:00" },
      ],
    };
    expect(formatScheduleLine(schedule)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });

  it("returns a placeholder for a schedule with no worked days at all", () => {
    const schedule: ScheduleTemplate = { id: "x", name: "x", tolerance_minutes: 0, days: [] };
    expect(formatScheduleLine(schedule)).toBe("Sin horario asignado");
  });
});

describe("resolveScheduleLine", () => {
  it("combines resolution and formatting in one call", () => {
    const schedulesById = new Map([[general.id, general]]);
    expect(resolveScheduleLine(null, null, schedulesById, general)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });
});

describe("FALLBACK_SCHEDULE", () => {
  it("is a plain Monday-Friday 8-5 schedule usable if the database query returns nothing", () => {
    expect(formatScheduleLine(FALLBACK_SCHEDULE)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });
});
