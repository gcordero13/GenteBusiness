import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  ClipboardList,
  Inbox,
  Pause,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/goservicesStatus";

const STATUS_ICONS: Record<string, LucideIcon> = {
  recibido: Inbox,
  en_proceso: Clock,
  en_espera: Pause,
  finalizado_ejecutor: CheckCircle2,
  completado: BadgeCheck,
  cancelado: XCircle,
};

export function GoservicesStatusSummary({ rows }: { rows: { status: string }[] }) {
  return (
    <div className="hidden sm:grid sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-7">
      <div className="group rounded-xl border border-[#04B1AF]/25 bg-gradient-to-br from-[#04B1AF]/10 to-[#04B1AF]/[0.03] p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[#04B1AF] uppercase">
          <span className="flex size-4 items-center justify-center rounded-full bg-[#04B1AF]/15">
            <ClipboardList className="size-2.5 text-[#04B1AF]" />
          </span>
          Total
        </div>
        <p className="mt-1.5 text-lg font-bold tabular-nums text-foreground">{rows.length}</p>
      </div>
      {Object.entries(STATUS_LABELS).map(([status, label]) => {
        const Icon = STATUS_ICONS[status] ?? ClipboardList;
        const colors = STATUS_COLORS[status] ?? STATUS_COLORS.recibido;
        const count = rows.filter((r) => r.status === status).length;
        return (
          <div
            key={status}
            className={`rounded-xl border p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${colors.border} ${colors.bg}`}
          >
            <div className={`flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase ${colors.text}`}>
              <span className="flex size-4 items-center justify-center rounded-full bg-white/70">
                <Icon className={`size-2.5 ${colors.text}`} />
              </span>
              {label}
            </div>
            <p className="mt-1.5 text-lg font-bold tabular-nums text-foreground">{count}</p>
          </div>
        );
      })}
    </div>
  );
}
