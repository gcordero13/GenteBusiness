import { BadgeCheck, CheckCircle2, Clock, ClipboardList, Inbox, XCircle, type LucideIcon } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/goservicesStatus";

const STATUS_ICONS: Record<string, LucideIcon> = {
  recibido: Inbox,
  en_proceso: Clock,
  finalizado_ejecutor: CheckCircle2,
  completado: BadgeCheck,
  cancelado: XCircle,
};

export function GoservicesStatusSummary({ rows }: { rows: { status: string }[] }) {
  return (
    <div className="hidden sm:grid sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
      <div className="group rounded-2xl border border-[#04B1AF]/25 bg-gradient-to-br from-[#04B1AF]/10 to-[#04B1AF]/[0.03] p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4 lg:p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#04B1AF] uppercase">
          <span className="flex size-5 items-center justify-center rounded-full bg-[#04B1AF]/15 sm:size-6 lg:size-7">
            <ClipboardList className="size-3 text-[#04B1AF] sm:size-3.5 lg:size-4" />
          </span>
          Total
        </div>
        <p className="mt-3 text-xl font-bold tabular-nums text-foreground sm:text-2xl lg:text-3xl">{rows.length}</p>
      </div>
      {Object.entries(STATUS_LABELS).map(([status, label]) => {
        const Icon = STATUS_ICONS[status] ?? ClipboardList;
        const colors = STATUS_COLORS[status] ?? STATUS_COLORS.recibido;
        const count = rows.filter((r) => r.status === status).length;
        return (
          <div
            key={status}
            className={`rounded-2xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4 lg:p-5 ${colors.border} ${colors.bg}`}
          >
            <div className={`flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${colors.text}`}>
              <span className="flex size-5 items-center justify-center rounded-full bg-white/70 sm:size-6 lg:size-7">
                <Icon className={`size-3 sm:size-3.5 lg:size-4 ${colors.text}`} />
              </span>
              {label}
            </div>
            <p className="mt-3 text-xl font-bold tabular-nums text-foreground sm:text-2xl lg:text-3xl">{count}</p>
          </div>
        );
      })}
    </div>
  );
}
