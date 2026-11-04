export interface VacationRequestSummaryRow {
  id: string;
  tipo: string;
  status: string;
  date_from: string;
  date_to: string;
  days_requested: number | null;
  requester_app_user_id: string;
  supervisor_app_user_id: string;
}

export interface AwaitingApprovalSummary {
  visible: boolean;
  count: number;
}

export interface ApprovedDaysSummary {
  vacacionesDias: number;
  permisoDias: number;
}

// date_from/date_to are plain "YYYY-MM-DD" date strings (no time component),
// so this parses them as UTC calendar dates to avoid any local-timezone
// off-by-one when computing the inclusive day span.
function daysBetweenInclusive(dateFrom: string, dateTo: string): number {
  const [fy, fm, fd] = dateFrom.split("-").map(Number);
  const [ty, tm, td] = dateTo.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000) + 1;
}

export function countOwnRequestsInProgress(requests: VacationRequestSummaryRow[], userId: string): number {
  return requests.filter(
    (r) =>
      r.requester_app_user_id === userId &&
      (r.status === "pendiente_supervisor" || r.status === "pendiente_rrhh"),
  ).length;
}

// The "Por aprobar" card is visible whenever the viewer has any approval
// role at all - either they're resolved as someone's supervisor on at least
// one request (regardless of that request's current status), or they hold
// can_authorize (RRHH). It stays visible even when the current count is 0,
// since "0 pendientes" is still meaningful information for an approver -
// only a viewer with no approval role at all gets the card hidden entirely.
export function summarizeAwaitingMyApproval(
  requests: VacationRequestSummaryRow[],
  userId: string,
  canAuthorize: boolean,
): AwaitingApprovalSummary {
  const isSupervisorOfSomeone = requests.some((r) => r.supervisor_app_user_id === userId);
  const visible = canAuthorize || isSupervisorOfSomeone;
  const count = requests.filter(
    (r) =>
      (r.status === "pendiente_supervisor" && r.supervisor_app_user_id === userId) ||
      (r.status === "pendiente_rrhh" && canAuthorize),
  ).length;
  return { visible, count };
}

// Vacaciones days come from days_requested (always set for that tipo).
// The other 6 tipos never set days_requested - it's computed from the date
// range instead, inclusive of both endpoints.
export function summarizeApprovedDaysForYear(
  requests: VacationRequestSummaryRow[],
  userId: string,
  year: number,
): ApprovedDaysSummary {
  let vacacionesDias = 0;
  let permisoDias = 0;
  for (const r of requests) {
    if (r.requester_app_user_id !== userId || r.status !== "aprobado") continue;
    const requestYear = Number(r.date_from.slice(0, 4));
    if (requestYear !== year) continue;
    if (r.tipo === "vacaciones") {
      vacacionesDias += r.days_requested ?? 0;
    } else {
      permisoDias += daysBetweenInclusive(r.date_from, r.date_to);
    }
  }
  return { vacacionesDias, permisoDias };
}

// todayIso is a "YYYY-MM-DD" string so the "future" comparison is a plain
// string comparison (works correctly for ISO-formatted dates) rather than
// Date parsing with its timezone pitfalls.
export function findNextApprovedVacationDate(
  requests: VacationRequestSummaryRow[],
  userId: string,
  todayIso: string,
): string | null {
  const upcoming = requests
    .filter(
      (r) =>
        r.requester_app_user_id === userId &&
        r.tipo === "vacaciones" &&
        r.status === "aprobado" &&
        r.date_from > todayIso,
    )
    .map((r) => r.date_from)
    .sort();
  return upcoming[0] ?? null;
}
