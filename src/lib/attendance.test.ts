import { describe, expect, it } from "vitest";
import {
  toBusinessTimeParts,
  buildDailyAttendanceRows,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  rankEarlyArrivals,
  buildAttendancePeriodRows,
  summarizeAttendancePeriod,
  classifyPuntualidadLabel,
  buildAttendanceGridDays,
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

describe("buildDailyAttendanceRows", () => {
  it("reports only an arrival for a day with a single morning punch", () => {
    const result = buildDailyAttendanceRows(["2026-01-15T12:30:00.000Z"]); // 08:30 local
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30, exitMinutes: null }]);
  });

  it("reports both an arrival and an exit for a day with a morning and an afternoon punch", () => {
    const result = buildDailyAttendanceRows([
      "2026-01-15T12:30:00.000Z", // 08:30 local
      "2026-01-15T21:00:00.000Z", // 17:00 local
    ]);
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30, exitMinutes: 17 * 60 }]);
  });

  it("reports only an exit (no arrival) for a day with a single afternoon-only punch", () => {
    const result = buildDailyAttendanceRows(["2026-01-15T21:00:00.000Z"]); // 17:00 local
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: null, exitMinutes: 17 * 60 }]);
  });

  it("reports the later of two afternoon-only punches as the exit, with no arrival", () => {
    const result = buildDailyAttendanceRows([
      "2026-01-15T19:00:00.000Z", // 15:00 local
      "2026-01-15T21:00:00.000Z", // 17:00 local
    ]);
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: null, exitMinutes: 17 * 60 }]);
  });

  it("returns one row per distinct day, sorted by date ascending", () => {
    const result = buildDailyAttendanceRows([
      "2026-01-16T12:00:00.000Z", // 08:00 local, the 16th
      "2026-01-15T12:30:00.000Z", // 08:30 local, the 15th
    ]);
    expect(result).toEqual([
      { dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30, exitMinutes: null },
      { dateIso: "2026-01-16", arrivalMinutes: 8 * 60, exitMinutes: null },
    ]);
  });

  it("returns an empty array for no punches", () => {
    expect(buildDailyAttendanceRows([])).toEqual([]);
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

  it("excludes a day whose only punch is at or after noon - not a real morning arrival", () => {
    const result = deriveDailyArrivals([
      "2026-01-15T21:00:00.000Z", // 17:00 local - an afternoon-only punch, e.g. a stray exit/test punch
    ]);
    expect(result).toEqual([]);
  });

  it("still picks the morning punch as the arrival when the same day also has an afternoon punch", () => {
    const result = deriveDailyArrivals([
      "2026-01-15T21:00:00.000Z", // 17:00 local
      "2026-01-15T12:30:00.000Z", // 08:30 local
    ]);
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30 }]);
  });

  it("treats exactly noon as ineligible (the cutoff is exclusive of noon itself)", () => {
    const result = deriveDailyArrivals([
      "2026-01-15T16:00:00.000Z", // 12:00 local exactly
    ]);
    expect(result).toEqual([]);
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

describe("rankEarlyArrivals", () => {
  function candidate(overrides: Partial<Parameters<typeof rankEarlyArrivals>[0][number]>) {
    return {
      contactId: "id",
      name: "Someone",
      photoUrl: null,
      arrivalMinutes: 480,
      scheduledStartMinutes: 480,
      ...overrides,
    };
  }

  it("sorts by minutesEarly descending", () => {
    const result = rankEarlyArrivals(
      [
        candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }), // 10 early
        candidate({ contactId: "b", arrivalMinutes: 460, scheduledStartMinutes: 480 }), // 20 early
        candidate({ contactId: "c", arrivalMinutes: 475, scheduledStartMinutes: 480 }), // 5 early
      ],
      5,
    );
    expect(result.map((r) => r.contactId)).toEqual(["b", "a", "c"]);
  });

  it("excludes anyone who arrived late (negative minutesEarly)", () => {
    const result = rankEarlyArrivals(
      [
        candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }), // 10 early
        candidate({ contactId: "b", arrivalMinutes: 490, scheduledStartMinutes: 480 }), // 10 late
      ],
      5,
    );
    expect(result.map((r) => r.contactId)).toEqual(["a"]);
  });

  it("keeps someone who arrived exactly on time (minutesEarly = 0)", () => {
    const result = rankEarlyArrivals([candidate({ contactId: "a", arrivalMinutes: 480, scheduledStartMinutes: 480 })], 5);
    expect(result.map((r) => r.contactId)).toEqual(["a"]);
  });

  it("limits the result to the requested count", () => {
    const candidates = [
      candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }),
      candidate({ contactId: "b", arrivalMinutes: 460, scheduledStartMinutes: 480 }),
      candidate({ contactId: "c", arrivalMinutes: 450, scheduledStartMinutes: 480 }),
    ];
    const result = rankEarlyArrivals(candidates, 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.contactId)).toEqual(["c", "b"]);
  });

  it("preserves input order for exact ties", () => {
    const result = rankEarlyArrivals(
      [
        candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }),
        candidate({ contactId: "b", arrivalMinutes: 470, scheduledStartMinutes: 480 }),
      ],
      5,
    );
    expect(result.map((r) => r.contactId)).toEqual(["a", "b"]);
  });

  it("returns an empty array for no candidates", () => {
    expect(rankEarlyArrivals([], 5)).toEqual([]);
  });
});

describe("buildAttendancePeriodRows", () => {
  // Monday-Friday 8:00 am - 5:00 pm, zero tolerance unless a test overrides it.
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

  it("marks a scheduled day covered by approved leave as permiso, even with no punch", () => {
    // 2026-01-12 is a Monday
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: null,
        exitMinutes: null,
        workedMinutes: null,
        estado: "permiso",
        observacion: "Permiso aprobado",
      },
    ]);
  });

  it("marks a scheduled day with no punch and no leave as ausente", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-12", schedule, [], [], 15);
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: null,
        exitMinutes: null,
        workedMinutes: null,
        estado: "ausente",
        observacion: "Sin justificación",
      },
    ]);
  });

  it("marks a late arrival as llegada_tarde, with the exact minute count in the observación", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 17 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60 + 20,
        exitMinutes: 17 * 60,
        workedMinutes: 17 * 60 - (8 * 60 + 20),
        estado: "llegada_tarde",
        observacion: "20 min tarde",
      },
    ]);
  });

  it("marks an on-time arrival with an early exit beyond the threshold as salida_anticipada", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 16 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 16 * 60,
        workedMinutes: 16 * 60 - 8 * 60,
        estado: "salida_anticipada",
        observacion: "60 min antes",
      },
    ]);
  });

  it("prioritizes llegada_tarde over salida_anticipada when both apply the same day", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 16 * 60 }],
      [],
      15,
    );
    expect(result[0].estado).toBe("llegada_tarde");
  });

  it("marks a fully on-time day as puntual", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 17 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 17 * 60,
        workedMinutes: 9 * 60,
        estado: "puntual",
        observacion: "—",
      },
    ]);
  });

  it("excludes a day that isn't scheduled for this schedule", () => {
    // 2026-01-11 is a Sunday - not in schedule.days
    const result = buildAttendancePeriodRows("2026-01-11", "2026-01-11", schedule, [], [], 15);
    expect(result).toEqual([]);
  });

  it("enumerates only scheduled days across a range that includes a weekend", () => {
    // 2026-01-09 Fri, 01-10 Sat, 01-11 Sun, 01-12 Mon - only Fri and Mon are scheduled
    const result = buildAttendancePeriodRows("2026-01-09", "2026-01-12", schedule, [], [], 15);
    expect(result.map((r) => r.dateIso)).toEqual(["2026-01-09", "2026-01-12"]);
  });

  it("returns an empty array when periodEndIso is before periodStartIso", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-11", schedule, [], [], 15);
    expect(result).toEqual([]);
  });
});

describe("summarizeAttendancePeriod", () => {
  it("counts each estado and computes derived stats for a mixed period", () => {
    const rows = [
      { dateIso: "2026-01-05", arrivalMinutes: 480, exitMinutes: 1020, workedMinutes: 540, estado: "puntual" as const, observacion: "—" },
      { dateIso: "2026-01-06", arrivalMinutes: 500, exitMinutes: 1020, workedMinutes: 520, estado: "llegada_tarde" as const, observacion: "20 min tarde" },
      { dateIso: "2026-01-07", arrivalMinutes: 480, exitMinutes: 960, workedMinutes: 480, estado: "salida_anticipada" as const, observacion: "60 min antes" },
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación" },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado" },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result).toEqual({
      diasHabiles: 5,
      diasTrabajados: 3,
      puntuales: 1,
      llegadasTarde: 1,
      salidasAnticipadas: 1,
      ausencias: 1,
      permisos: 1,
      feriados: 0,
      horasTrabajadasMinutes: 540 + 520 + 480,
      promedioEntradaMinutes: (480 + 500 + 480) / 3,
      puntualidadPercent: Math.round((1 / 3) * 100),
    });
  });

  it("returns null-safe stats for a period with zero días trabajados", () => {
    const rows = [
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación" },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado" },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result.diasTrabajados).toBe(0);
    expect(result.promedioEntradaMinutes).toBeNull();
    expect(result.puntualidadPercent).toBeNull();
    expect(result.horasTrabajadasMinutes).toBe(0);
    expect(result.feriados).toBe(0);
  });
});

describe("classifyPuntualidadLabel", () => {
  it("classifies below 85 as A mejorar", () => {
    expect(classifyPuntualidadLabel(84)).toBe("A mejorar");
  });

  it("classifies exactly 85 as Buena", () => {
    expect(classifyPuntualidadLabel(85)).toBe("Buena");
  });

  it("classifies just under 95 as Buena", () => {
    expect(classifyPuntualidadLabel(94)).toBe("Buena");
  });

  it("classifies exactly 95 as Excelente", () => {
    expect(classifyPuntualidadLabel(95)).toBe("Excelente");
  });

  it("returns null for null input", () => {
    expect(classifyPuntualidadLabel(null)).toBeNull();
  });
});

describe("buildAttendanceGridDays", () => {
  // Monday-Friday 8:00 am - 5:00 pm, zero tolerance.
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

  it("marks a day covered by an approved vacaciones range as vacaciones", () => {
    // 2026-01-12 is a Monday
    const result = buildAttendanceGridDays(
      "2026-01-12",
      "2026-01-12",
      "2026-01-31",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      [],
    );
    expect(result).toEqual([
      { dateIso: "2026-01-12", dayNumber: 12, arrivalLabel: null, exitLabel: null, status: "vacaciones" },
    ]);
  });

  it("marks a day covered by an approved permiso range as permiso", () => {
    const result = buildAttendanceGridDays("2026-01-12", "2026-01-12", "2026-01-31", schedule, [], [], [
      { dateFrom: "2026-01-12", dateTo: "2026-01-12" },
    ]);
    expect(result[0].status).toBe("permiso");
  });

  it("prioritizes vacaciones over permiso when both cover the same day", () => {
    const result = buildAttendanceGridDays(
      "2026-01-12",
      "2026-01-12",
      "2026-01-31",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
    );
    expect(result[0].status).toBe("vacaciones");
  });

  it("marks a scheduled workday with no punch, on or before today, as ausente", () => {
    const result = buildAttendanceGridDays("2026-01-12", "2026-01-12", "2026-01-31", schedule, [], [], []);
    expect(result[0].status).toBe("ausente");
  });

  it("does not mark a future scheduled workday as ausente", () => {
    const result = buildAttendanceGridDays("2026-01-12", "2026-01-12", "2026-01-01", schedule, [], [], []);
    expect(result[0].status).toBe("normal");
  });

  it("marks a non-scheduled day (weekend) with no punch as weekend, not ausente", () => {
    // 2026-01-11 is a Sunday
    const result = buildAttendanceGridDays("2026-01-11", "2026-01-11", "2026-01-31", schedule, [], [], []);
    expect(result[0].status).toBe("weekend");
  });

  it("shows real arrival/exit times on a normal punched day, with normal status", () => {
    const result = buildAttendanceGridDays(
      "2026-01-12",
      "2026-01-12",
      "2026-01-31",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 17 * 60 }],
      [],
      [],
    );
    expect(result[0]).toEqual({
      dateIso: "2026-01-12",
      dayNumber: 12,
      arrivalLabel: "8:00 am",
      exitLabel: "5:00 pm",
      status: "normal",
    });
  });

  it("shows real punch times on a weekend day (e.g. approved overtime) while keeping weekend status", () => {
    // 2026-01-10 is a Saturday
    const result = buildAttendanceGridDays(
      "2026-01-10",
      "2026-01-10",
      "2026-01-31",
      schedule,
      [{ dateIso: "2026-01-10", arrivalMinutes: 9 * 60, exitMinutes: 12 * 60 }],
      [],
      [],
    );
    expect(result[0]).toEqual({
      dateIso: "2026-01-10",
      dayNumber: 10,
      arrivalLabel: "9:00 am",
      exitLabel: "12:00 pm",
      status: "weekend",
    });
  });

  it("enumerates every calendar day across a multi-day range, including weekends", () => {
    // Fri 2026-01-09 through Mon 2026-01-12 - 4 calendar days, not just the 2 workdays
    const result = buildAttendanceGridDays("2026-01-09", "2026-01-12", "2026-01-01", schedule, [], [], []);
    expect(result.map((d) => d.dateIso)).toEqual(["2026-01-09", "2026-01-10", "2026-01-11", "2026-01-12"]);
  });
});
