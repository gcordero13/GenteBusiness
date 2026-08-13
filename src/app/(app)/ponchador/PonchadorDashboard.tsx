import { CalendarClock, Clock3, TrendingUp, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PeriodFilter } from "./PeriodFilter";
import type { DayEstado, AttendancePeriodSummary } from "@/lib/attendance";

export interface PonchadorRow {
  dateIso: string;
  dateLabel: string;
  arrivalLabel: string | null;
  exitLabel: string | null;
  workedLabel: string | null;
  estado: DayEstado;
  estadoLabel: string;
  observacion: string;
}

export type PonchadorSummary = Pick<
  AttendancePeriodSummary,
  | "diasHabiles"
  | "diasTrabajados"
  | "puntuales"
  | "llegadasTarde"
  | "salidasAnticipadas"
  | "ausencias"
  | "permisos"
  | "feriados"
> & {
  horasTrabajadasLabel: string;
  promedioDiarioLabel: string;
};

const ESTADO_BADGE_CLASSNAMES: Record<PonchadorRow["estado"], string> = {
  puntual: "bg-emerald-100 text-emerald-700",
  llegada_tarde: "bg-amber-100 text-amber-700",
  salida_anticipada: "bg-orange-100 text-orange-700",
  ausente: "bg-red-100 text-red-700",
  permiso: "bg-blue-100 text-blue-700",
};

export function PonchadorDashboard({
  year,
  month,
  currentYear,
  currentMonth,
  periodLabel,
  averageArrivalLabel,
  averageArrivalDeltaLabel,
  diasTrabajadosLabel,
  puntualidadLabel,
  horasTrabajadasLabel,
  rows,
  summary,
  motivationalPhrase,
  scheduleFooterNote,
}: {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
  periodLabel: string;
  averageArrivalLabel: string | null;
  averageArrivalDeltaLabel: string | null;
  diasTrabajadosLabel: string;
  puntualidadLabel: string;
  horasTrabajadasLabel: string;
  rows: PonchadorRow[];
  summary: PonchadorSummary;
  motivationalPhrase: string | null;
  scheduleFooterNote: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Período seleccionado</p>
          <p className="text-base font-semibold">{periodLabel}</p>
        </div>
        <PeriodFilter year={year} month={month} currentYear={currentYear} currentMonth={currentMonth} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TrendingUp className="size-4 text-[#04B1AF]" />
            Promedio de entrada
          </div>
          <p className="mt-2 text-2xl font-bold">{averageArrivalLabel ?? "Sin datos"}</p>
          {averageArrivalDeltaLabel && (
            <p className="mt-1 text-sm text-muted-foreground">{averageArrivalDeltaLabel}</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <CalendarClock className="size-4 text-[#04B1AF]" />
            Días trabajados
          </div>
          <p className="mt-2 text-2xl font-bold">{summary.diasTrabajados}</p>
          <p className="mt-1 text-sm text-muted-foreground">{diasTrabajadosLabel}</p>
        </div>

        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Users className="size-4 text-[#04B1AF]" />
            Puntualidad
          </div>
          <p className="mt-2 text-2xl font-bold">{puntualidadLabel}</p>
        </div>

        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Clock3 className="size-4 text-[#04B1AF]" />
            Horas trabajadas
          </div>
          <p className="mt-2 text-2xl font-bold">{horasTrabajadasLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-muted-foreground" />
            Registro de asistencia
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay días programados en este período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.dateIso}>
                    <TableCell>{row.dateLabel}</TableCell>
                    <TableCell>{row.arrivalLabel ?? "—"}</TableCell>
                    <TableCell>{row.exitLabel ?? "—"}</TableCell>
                    <TableCell>{row.workedLabel ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={ESTADO_BADGE_CLASSNAMES[row.estado]}>{row.estadoLabel}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.observacion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border p-5">
            <p className="mb-3 text-sm font-semibold">Resumen del período</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Días trabajados</dt>
                <dd className="font-medium">{summary.diasTrabajados}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Puntuales</dt>
                <dd className="font-medium">{summary.puntuales}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Llegadas tarde</dt>
                <dd className="font-medium">{summary.llegadasTarde}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Salidas anticipadas</dt>
                <dd className="font-medium">{summary.salidasAnticipadas}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ausencias</dt>
                <dd className="font-medium">{summary.ausencias}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Permisos</dt>
                <dd className="font-medium">{summary.permisos}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Feriados</dt>
                <dd className="font-medium">{summary.feriados}</dd>
              </div>
            </dl>
            <div className="mt-3 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Horas trabajadas</dt>
                <dd className="font-medium">{summary.horasTrabajadasLabel}</dd>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Promedio diario: {summary.promedioDiarioLabel}</p>
            </div>
          </div>

          {motivationalPhrase && (
            <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-4 text-sm">
              {motivationalPhrase}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{scheduleFooterNote}</p>
    </div>
  );
}
