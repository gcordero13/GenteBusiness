import { describe, expect, it } from "vitest";
import { toBusinessTimeParts, deriveDailyArrivals, averageArrivalMinutes, formatArrivalTime } from "./attendance";

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
