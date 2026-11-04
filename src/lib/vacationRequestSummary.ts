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

export interface VacationDateRange {
  date_from: string;
  date_to: string;
}

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

export function findNextApprovedVacation(
  requests: VacationRequestSummaryRow[],
  userId: string,
  todayIso: string,
): VacationDateRange | null {
  const upcoming = requests
    .filter(
      (r) =>
        r.requester_app_user_id === userId &&
        r.tipo === "vacaciones" &&
        r.status === "aprobado" &&
        r.date_from > todayIso,
    )
    .sort((a, b) => a.date_from.localeCompare(b.date_from));
  const next = upcoming[0];
  return next ? { date_from: next.date_from, date_to: next.date_to } : null;
}

export function findLastTakenVacation(
  requests: VacationRequestSummaryRow[],
  userId: string,
  todayIso: string,
): VacationDateRange | null {
  const taken = requests
    .filter(
      (r) =>
        r.requester_app_user_id === userId &&
        r.tipo === "vacaciones" &&
        r.status === "aprobado" &&
        r.date_from <= todayIso,
    )
    .sort((a, b) => b.date_from.localeCompare(a.date_from));
  const last = taken[0];
  return last ? { date_from: last.date_from, date_to: last.date_to } : null;
}

export function formatFechaEs(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-DO", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
