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
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-gradient-to-br from-[#04B1AF]/10 to-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#04B1AF]/20">
            <Hourglass className="size-5 text-[#04B1AF]" aria-hidden="true" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
            Mis solicitudes en trámite
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold">{inProgressCount}</p>
      </div>

      {approval.visible && (
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-100 to-orange-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-200">
              <ClipboardCheck className="size-5 text-orange-600" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">Por aprobar</span>
          </div>
          <p className="mt-3 text-2xl font-bold">{approval.count}</p>
        </div>
      )}

      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-200">
            <CalendarCheck className="size-5 text-emerald-700" aria-hidden="true" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
            Días aprobados ({year})
          </span>
        </div>
        <div className="mt-3 flex gap-6">
          <div>
            <p className="text-2xl font-bold">{approvedDays.vacacionesDias}</p>
            <p className="text-xs text-neutral-600">Vacaciones</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{approvedDays.permisoDias}</p>
            <p className="text-xs text-neutral-600">Permisos</p>
          </div>
        </div>
      </div>

      {lastVacation && (
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-200">
              <History className="size-5 text-blue-700" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">Última vacación</span>
          </div>
          <p className="mt-3 text-sm font-medium">
            Del {formatFechaEs(lastVacation.date_from)} al {formatFechaEs(lastVacation.date_to)}
          </p>
        </div>
      )}

      {nextVacation && (
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-200">
              <Plane className="size-5 text-blue-700" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">Próxima vacación</span>
          </div>
          <p className="mt-3 text-sm font-medium">
            Del {formatFechaEs(nextVacation.date_from)} al {formatFechaEs(nextVacation.date_to)}
          </p>
        </div>
      )}
    </div>
  );
}
