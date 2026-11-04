import { describe, expect, it } from "vitest";
import {
  countOwnRequestsInProgress,
  findLastTakenVacation,
  findNextApprovedVacation,
  formatFechaEs,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
  type VacationRequestSummaryRow,
} from "./vacationRequestSummary";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

function row(overrides: Partial<VacationRequestSummaryRow>): VacationRequestSummaryRow {
  return {
    id: "req-1",
    tipo: "vacaciones",
    status: "aprobado",
    date_from: "2026-11-10",
    date_to: "2026-11-14",
    days_requested: 5,
    requester_app_user_id: USER_ID,
    supervisor_app_user_id: OTHER_USER_ID,
    ...overrides,
  };
}

describe("countOwnRequestsInProgress", () => {
  it("returns 0 for an empty array", () => {
    expect(countOwnRequestsInProgress([], USER_ID)).toBe(0);
  });

  it("counts only the user's own pendiente_supervisor and pendiente_rrhh requests", () => {
    const requests = [
      row({ id: "a", status: "pendiente_supervisor" }),
      row({ id: "b", status: "pendiente_rrhh" }),
      row({ id: "c", status: "aprobado" }),
      row({ id: "d", status: "rechazado" }),
      row({ id: "e", status: "pendiente_supervisor", requester_app_user_id: OTHER_USER_ID }),
    ];

    expect(countOwnRequestsInProgress(requests, USER_ID)).toBe(2);
  });
});

describe("summarizeAwaitingMyApproval", () => {
  it("is not visible and counts 0 when the viewer is neither a supervisor nor can authorize", () => {
    const requests = [row({ status: "pendiente_rrhh" })];

    const result = summarizeAwaitingMyApproval(requests, USER_ID, false);

    expect(result).toEqual({ visible: false, count: 0 });
  });

  it("is visible with count 0 when canAuthorize is true but nothing is pending for RRHH", () => {
    const requests = [row({ status: "aprobado" })];

    const result = summarizeAwaitingMyApproval(requests, USER_ID, true);

    expect(result).toEqual({ visible: true, count: 0 });
  });

  it("is visible with count 0 when the viewer supervises someone but nothing is pending for them right now", () => {
    const requests = [row({ status: "aprobado", supervisor_app_user_id: USER_ID })];

    const result = summarizeAwaitingMyApproval(requests, USER_ID, false);

    expect(result).toEqual({ visible: true, count: 0 });
  });

  it("counts pendiente_supervisor rows where the viewer is the resolved supervisor", () => {
    const requests = [
      row({ id: "a", status: "pendiente_supervisor", supervisor_app_user_id: USER_ID }),
      row({ id: "b", status: "pendiente_supervisor", supervisor_app_user_id: OTHER_USER_ID }),
    ];

    expect(summarizeAwaitingMyApproval(requests, USER_ID, false)).toEqual({ visible: true, count: 1 });
  });

  it("counts pendiente_rrhh rows only when canAuthorize is true", () => {
    const requests = [
      row({ id: "a", status: "pendiente_rrhh" }),
      row({ id: "b", status: "pendiente_rrhh" }),
    ];

    expect(summarizeAwaitingMyApproval(requests, USER_ID, true)).toEqual({ visible: true, count: 2 });
    expect(summarizeAwaitingMyApproval(requests, USER_ID, false)).toEqual({ visible: false, count: 0 });
  });
});

describe("summarizeApprovedDaysForYear", () => {
  it("sums days_requested for approved vacaciones requests in the given year", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2026-01-05", days_requested: 5 }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-06-01", days_requested: 3 }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 8, permisoDias: 0 });
  });

  it("excludes a request from a different year (year-boundary check)", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2025-12-31", date_to: "2026-01-02", days_requested: 3 }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 0, permisoDias: 0 });
  });

  it("computes permiso days inclusively from date_from/date_to (not days_requested, which is null for these tipos)", () => {
    const requests = [
      row({ id: "a", tipo: "medico", status: "aprobado", date_from: "2026-03-01", date_to: "2026-03-01", days_requested: null }),
      row({ id: "b", tipo: "familiar", status: "aprobado", date_from: "2026-03-10", date_to: "2026-03-12", days_requested: null }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 0, permisoDias: 4 });
  });

  it("excludes requests that are not aprobado or not the viewer's own", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "pendiente_rrhh", date_from: "2026-01-05", days_requested: 5 }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-01-05", days_requested: 5, requester_app_user_id: OTHER_USER_ID }),
    ];

    expect(summarizeApprovedDaysForYear(requests, USER_ID, 2026)).toEqual({ vacacionesDias: 0, permisoDias: 0 });
  });
});

describe("findNextApprovedVacation", () => {
  const TODAY_ISO = "2026-11-03";

  it("returns null when there are no upcoming approved vacaciones", () => {
    expect(findNextApprovedVacation([], USER_ID, TODAY_ISO)).toBeNull();
  });

  it("excludes a vacation that already started or ended in the past", () => {
    const requests = [row({ tipo: "vacaciones", status: "aprobado", date_from: "2026-10-01", date_to: "2026-10-05" })];

    expect(findNextApprovedVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });

  it("returns the nearest future approved vacation's full date range among several", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2026-12-20", date_to: "2026-12-27" }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-11-15", date_to: "2026-11-22" }),
      row({ id: "c", tipo: "vacaciones", status: "aprobado", date_from: "2027-01-10", date_to: "2027-01-15" }),
    ];

    expect(findNextApprovedVacation(requests, USER_ID, TODAY_ISO)).toEqual({ date_from: "2026-11-15", date_to: "2026-11-22" });
  });

  it("ignores a future request that isn't tipo vacaciones or isn't aprobado yet", () => {
    const requests = [
      row({ id: "a", tipo: "medico", status: "aprobado", date_from: "2026-11-15" }),
      row({ id: "b", tipo: "vacaciones", status: "pendiente_rrhh", date_from: "2026-11-20" }),
    ];

    expect(findNextApprovedVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });
});

describe("findLastTakenVacation", () => {
  const TODAY_ISO = "2026-11-03";

  it("returns null when none have been taken yet", () => {
    expect(findLastTakenVacation([], USER_ID, TODAY_ISO)).toBeNull();
  });

  it("excludes a vacation that hasn't started yet", () => {
    const requests = [row({ tipo: "vacaciones", status: "aprobado", date_from: "2026-11-15", date_to: "2026-11-20" })];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });

  it("counts a vacation currently in progress (date_from <= today <= date_to) as taken", () => {
    const requests = [row({ tipo: "vacaciones", status: "aprobado", date_from: "2026-11-01", date_to: "2026-11-05" })];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toEqual({ date_from: "2026-11-01", date_to: "2026-11-05" });
  });

  it("returns the most recent among several past approved vacations", () => {
    const requests = [
      row({ id: "a", tipo: "vacaciones", status: "aprobado", date_from: "2026-01-05", date_to: "2026-01-10" }),
      row({ id: "b", tipo: "vacaciones", status: "aprobado", date_from: "2026-09-01", date_to: "2026-09-08" }),
      row({ id: "c", tipo: "vacaciones", status: "aprobado", date_from: "2025-06-01", date_to: "2025-06-08" }),
    ];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toEqual({ date_from: "2026-09-01", date_to: "2026-09-08" });
  });

  it("ignores a past request that isn't tipo vacaciones, isn't aprobado, or belongs to someone else", () => {
    const requests = [
      row({ id: "a", tipo: "medico", status: "aprobado", date_from: "2026-09-01", date_to: "2026-09-02" }),
      row({ id: "b", tipo: "vacaciones", status: "rechazado", date_from: "2026-09-01", date_to: "2026-09-02" }),
      row({ id: "c", tipo: "vacaciones", status: "aprobado", date_from: "2026-09-01", date_to: "2026-09-02", requester_app_user_id: OTHER_USER_ID }),
    ];

    expect(findLastTakenVacation(requests, USER_ID, TODAY_ISO)).toBeNull();
  });
});

describe("formatFechaEs", () => {
  it("formats a single-digit day and month with the full Spanish month name and no leading zeros", () => {
    expect(formatFechaEs("2026-01-05")).toBe("5 de enero de 2026");
  });

  it("formats a double-digit day", () => {
    expect(formatFechaEs("2026-11-22")).toBe("22 de noviembre de 2026");
  });

  it("is not affected by the local timezone (uses UTC explicitly)", () => {
    expect(formatFechaEs("2026-11-01")).toBe("1 de noviembre de 2026");
  });
});
