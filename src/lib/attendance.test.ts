import { describe, expect, it } from "vitest";
import {
  toBusinessTimeParts,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
} from "./attendance";

describe("toBusinessTimeParts", () => {
  it("converts a UTC timestamp to the business-timezone calendar day and minutes-since-midnight", () => {
    // 2026-01-15T12:30:00Z is 2026-01-15 08:30 in America/Santo_Domingo (UTC-4)
    const result = toBusinessTimeParts("2026-01-15T12:30:00.000Z");
    expect(result).toEqual({ dateIso: "2026-01-15", minutesSinceMidnight: 8 * 60 + 30 });
  });

  it("handles a timestamp that crosses the UTC day boundary but not the business-timezone day boundary", () => {
    // 2026-01-15T02:00:00Z is still 2026-01-14 22:00 in America/Santo_Domingo -
    // a naive UTC-calendar read would say "the 15th", the business day is "the 14th"
    const result = toBusinessTimeParts("2026-01-15T02:00:00.000Z");
    expect(result).toEqual({ dateIso: "2026-01-14", minutesSinceMidnight: 22 * 60 });
  });

  it("resolves exactly business-timezone midnight to minute 0", () => {
    // 2026-01-01T04:00:00Z is exactly 2026-01-01 00:00 in America/Santo_Domingo
    const result = toBusinessTimeParts("2026-01-01T04:00:00.000Z");
    expect(result).toEqual({ dateIso: "2026-01-01", minutesSinceMidnight: 0 });
  });
});

describe("deriveDailyArrivals", () => {
  it("keeps only the earliest punch per business-timezone day", () => {
    const result = deriveDailyArrivals([
      "2026-01-15T13:00:00.000Z", // 09:00 local
      "2026-01-15T12:30:00.000Z", // 08:30 local - earlier, should win
      "2026-01-15T18:00:00.000Z", // 14:00 local - a later punch same day, ignored
    ]);
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30 }]);
  });

  it("returns one entry per distinct day, sorted by date ascending", () => {
    const result = deriveDailyArrivals([
      "2026-01-16T12:00:00.000Z", // 08:00 local, the 16th
      "2026-01-15T12:30:00.000Z", // 08:30 local, the 15th
    ]);
    expect(result).toEqual([
      { dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30 },
      { dateIso: "2026-01-16", arrivalMinutes: 8 * 60 },
    ]);
  });

  it("returns an empty array for no punches", () => {
    expect(deriveDailyArrivals([])).toEqual([]);
  });
});

describe("averageArrivalMinutes", () => {
  it("returns null for an empty list", () => {
    expect(averageArrivalMinutes([])).toBeNull();
  });

  it("returns the arrival time itself for a single day", () => {
    expect(averageArrivalMinutes([{ dateIso: "2026-01-15", arrivalMinutes: 480 }])).toBe(480);
  });

  it("averages the arrival minutes across multiple days", () => {
    const result = averageArrivalMinutes([
      { dateIso: "2026-01-15", arrivalMinutes: 480 },
      { dateIso: "2026-01-16", arrivalMinutes: 500 },
    ]);
    expect(result).toBe(490);
  });
});

describe("formatArrivalTime", () => {
  it("formats a morning time with am", () => {
    expect(formatArrivalTime(8 * 60)).toBe("8:00 am");
  });

  it("formats an afternoon time with pm", () => {
    expect(formatArrivalTime(17 * 60)).toBe("5:00 pm");
  });

  it("formats midnight as 12:00 am", () => {
    expect(formatArrivalTime(0)).toBe("12:00 am");
  });

  it("formats noon as 12:00 pm", () => {
    expect(formatArrivalTime(12 * 60)).toBe("12:00 pm");
  });

  it("zero-pads the minute", () => {
    expect(formatArrivalTime(9 * 60 + 5)).toBe("9:05 am");
  });

  it("rounds a fractional minute count before formatting", () => {
    // averageArrivalMinutes can return a fractional average across several days
    expect(formatArrivalTime(8 * 60 + 30.6)).toBe("8:31 am");
  });
});

describe("scheduleTimeToMinutes", () => {
  it("converts an HH:MM:SS schedule time to minutes since midnight", () => {
    expect(scheduleTimeToMinutes("08:00:00")).toBe(480);
    expect(scheduleTimeToMinutes("17:30:00")).toBe(1050);
    expect(scheduleTimeToMinutes("00:00:00")).toBe(0);
  });
});

describe("attachScheduleComparison", () => {
  // Monday-Friday 8:00 am, tolerance irrelevant to this function
  const schedule = {
    id: "s1",
    name: "General",
    tolerance_minutes: 0,
    days: [1, 2, 3, 4, 5].map((day_of_week) => ({
      day_of_week,
      start_time: "08:00:00",
      end_time: "17:00:00",
    })),
  };

  it("computes minutesEarly as positive when arriving before the scheduled start", () => {
    // 2026-01-14 is a Wednesday
    const result = attachScheduleComparison([{ dateIso: "2026-01-14", arrivalMinutes: 470 }], schedule);
    expect(result).toEqual([{ dateIso: "2026-01-14", arrivalMinutes: 470, minutesEarly: 10 }]);
  });

  it("computes minutesEarly as negative when arriving after the scheduled start", () => {
    const result = attachScheduleComparison([{ dateIso: "2026-01-14", arrivalMinutes: 490 }], schedule);
    expect(result[0].minutesEarly).toBe(-10);
  });

  it("returns null minutesEarly for a day the schedule doesn't work (e.g. a Sunday)", () => {
    // 2026-01-18 is a Sunday - not in this schedule's days
    const result = attachScheduleComparison([{ dateIso: "2026-01-18", arrivalMinutes: 480 }], schedule);
    expect(result).toEqual([{ dateIso: "2026-01-18", arrivalMinutes: 480, minutesEarly: null }]);
  });
});

describe("averageMinutesEarly", () => {
  it("returns null when every entry has a null minutesEarly", () => {
    const result = averageMinutesEarly([
      { dateIso: "2026-01-18", arrivalMinutes: 480, minutesEarly: null },
    ]);
    expect(result).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(averageMinutesEarly([])).toBeNull();
  });

  it("averages only the non-null entries, ignoring null ones", () => {
    const result = averageMinutesEarly([
      { dateIso: "2026-01-14", arrivalMinutes: 470, minutesEarly: 10 },
      { dateIso: "2026-01-15", arrivalMinutes: 490, minutesEarly: -10 },
      { dateIso: "2026-01-18", arrivalMinutes: 480, minutesEarly: null },
    ]);
    expect(result).toBe(0);
  });
});

describe("classifyArrivalTier", () => {
  it("classifies more than 15 minutes late as muy_tarde", () => {
    expect(classifyArrivalTier(-16, 0)).toBe("muy_tarde");
  });

  it("classifies exactly 15 minutes late as un_poco_tarde, not muy_tarde", () => {
    expect(classifyArrivalTier(-15, 0)).toBe("un_poco_tarde");
  });

  it("classifies late beyond tolerance but within 15 minutes as un_poco_tarde", () => {
    expect(classifyArrivalTier(-5, 0)).toBe("un_poco_tarde");
  });

  it("classifies exactly on time (average equals 0, zero tolerance) as a_tiempo", () => {
    expect(classifyArrivalTier(0, 0)).toBe("a_tiempo");
  });

  it("classifies within a non-zero tolerance as a_tiempo, even if technically late", () => {
    expect(classifyArrivalTier(-3, 5)).toBe("a_tiempo");
  });

  it("classifies within a non-zero tolerance as a_tiempo, even if technically early", () => {
    expect(classifyArrivalTier(3, 5)).toBe("a_tiempo");
  });

  it("classifies more than tolerance early but under 10 minutes as temprano", () => {
    expect(classifyArrivalTier(6, 5)).toBe("temprano");
  });

  it("classifies just under 10 minutes early as temprano, not muy_temprano", () => {
    expect(classifyArrivalTier(9, 0)).toBe("temprano");
  });

  it("classifies exactly 10 minutes early as muy_temprano", () => {
    expect(classifyArrivalTier(10, 0)).toBe("muy_temprano");
  });

  it("classifies well over 10 minutes early as muy_temprano", () => {
    expect(classifyArrivalTier(25, 0)).toBe("muy_temprano");
  });
});

describe("pickMotivationalPhrase", () => {
  it("substitutes {name} into the selected phrase", () => {
    const result = pickMotivationalPhrase("a_tiempo", "Carlos", 0);
    expect(result).toContain("Carlos");
    expect(result).not.toContain("{name}");
  });

  it("returns the same phrase for the same tier and day of month every time", () => {
    const first = pickMotivationalPhrase("temprano", "Ana", 5);
    const second = pickMotivationalPhrase("temprano", "Ana", 5);
    expect(first).toBe(second);
  });

  it("can return different phrases from the same tier's pool on different days", () => {
    // muy_tarde has 3 phrases; day 0 and day 1 select different pool indices
    const dayZero = pickMotivationalPhrase("muy_tarde", "Ana", 0);
    const dayOne = pickMotivationalPhrase("muy_tarde", "Ana", 1);
    expect(dayZero).not.toBe(dayOne);
  });

  it("only ever returns a phrase belonging to the requested tier", () => {
    for (let day = 0; day < 31; day++) {
      const result = pickMotivationalPhrase("muy_temprano", "Ana", day);
      expect(result.includes("primeros") || result.includes("disciplina") || result.includes("máquina")).toBe(
        true,
      );
    }
  });
});
