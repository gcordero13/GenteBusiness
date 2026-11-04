import { CalendarCheck, ClipboardCheck, History, Hourglass, Plane } from "lucide-react";
import {
  formatFechaEs,
  type ApprovedDaysSummary,
  type AwaitingApprovalSummary,
  type VacationDateRange,
} from "@/lib/vacationRequestSummary";

interface SolicitudesSummaryCardsProps {
  year: number;
  inProgressCount: number;
  approval: AwaitingApprovalSummary;
  approvedDays: ApprovedDaysSummary;
  lastVacation: VacationDateRange | null;
  nextVacation: VacationDateRange | null;
}

export function SolicitudesSummaryCards({
  year,
  inProgressCount,
  approval,
  approvedDays,
  lastVacation,
  nextVacation,
}: SolicitudesSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Hourglass className="size-4 text-[#04B1AF]" aria-hidden="true" />
          Mis solicitudes en trámite
        </div>
        <p className="mt-2 text-2xl font-bold">{inProgressCount}</p>
      </div>

      {approval.visible && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ClipboardCheck className="size-4 text-orange-600" aria-hidden="true" />
            Por aprobar
          </div>
          <p className="mt-2 text-2xl font-bold">{approval.count}</p>
        </div>
      )}

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <CalendarCheck className="size-4 text-blue-600" aria-hidden="true" />
          Días aprobados ({year})
        </div>
        <div className="mt-2 flex gap-6">
          <div>
            <p className="text-2xl font-bold">{approvedDays.vacacionesDias}</p>
            <p className="text-xs text-muted-foreground">Vacaciones</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{approvedDays.permisoDias}</p>
            <p className="text-xs text-muted-foreground">Permisos</p>
          </div>
        </div>
      </div>

      {lastVacation && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <History className="size-4 text-blue-600" aria-hidden="true" />
            Última vacación
          </div>
          <p className="mt-2 text-sm font-medium">
            Del {formatFechaEs(lastVacation.date_from)} al {formatFechaEs(lastVacation.date_to)}
          </p>
        </div>
      )}

      {nextVacation && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Plane className="size-4 text-blue-600" aria-hidden="true" />
            Próxima vacación
          </div>
          <p className="mt-2 text-sm font-medium">
            Del {formatFechaEs(nextVacation.date_from)} al {formatFechaEs(nextVacation.date_to)}
          </p>
        </div>
      )}
    </div>
  );
}
