import { describe, expect, it } from "vitest";
import {
  formatScheduleLine,
  formatScheduleTime,
  formatWorkdays,
  getEffectiveSchedule,
  type CompanySchedule,
  type ScheduleOverrideFields,
} from "./schedules";

const companyDefault: CompanySchedule = {
  start_time: "08:00:00",
  end_time: "17:00:00",
  workdays: [1, 2, 3, 4, 5],
  tolerance_minutes: 0,
};

describe("getEffectiveSchedule", () => {
  it("uses the personal override when schedule_start_time is set", () => {
    const override: ScheduleOverrideFields = {
      schedule_start_time: "09:00:00",
      schedule_end_time: "18:00:00",
      schedule_workdays: [1, 2, 3, 4, 5, 6],
      schedule_tolerance_minutes: 10,
    };

    expect(getEffectiveSchedule(override, companyDefault)).toEqual({
      start_time: "09:00:00",
      end_time: "18:00:00",
      workdays: [1, 2, 3, 4, 5, 6],
      tolerance_minutes: 10,
    });
  });

  it("uses the company default when no override is set", () => {
    const override: ScheduleOverrideFields = {
      schedule_start_time: null,
      schedule_end_time: null,
      schedule_workdays: null,
      schedule_tolerance_minutes: null,
    };

    expect(getEffectiveSchedule(override, companyDefault)).toEqual(companyDefault);
  });

  it("falls back entirely to the company default for a corrupted partial override (schedule_start_time null, siblings set) - only schedule_start_time is checked, not the siblings", () => {
    const override: ScheduleOverrideFields = {
      schedule_start_time: null,
      schedule_end_time: "18:00:00",
      schedule_workdays: [6],
      schedule_tolerance_minutes: 99,
    };

    expect(getEffectiveSchedule(override, companyDefault)).toEqual(companyDefault);
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

describe("formatWorkdays", () => {
  it("formats a contiguous range as 'X a Y'", () => {
    expect(formatWorkdays([1, 2, 3, 4, 5])).toBe("Lunes a viernes");
  });

  it("formats a single day by name", () => {
    expect(formatWorkdays([3])).toBe("Miércoles");
  });

  it("formats all seven days as the full-week contiguous range", () => {
    expect(formatWorkdays([0, 1, 2, 3, 4, 5, 6])).toBe("Domingo a sábado");
  });

  it("formats a non-contiguous set as a comma list", () => {
    expect(formatWorkdays([1, 3, 5])).toBe("Lunes, miércoles, viernes");
  });
});

describe("formatScheduleLine", () => {
  it("combines workdays and times into one display line", () => {
    expect(formatScheduleLine(companyDefault)).toBe("Lunes a viernes, 8:00 am – 5:00 pm");
  });
});
