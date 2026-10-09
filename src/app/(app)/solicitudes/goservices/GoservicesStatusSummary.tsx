import { BadgeCheck, CheckCircle2, ClipboardList, Inbox, Loader2, XCircle, type LucideIcon } from "lucide-react";
import { STATUS_LABELS } from "@/lib/goservicesStatus";

const STATUS_ICONS: Record<string, LucideIcon> = {
  recibido: Inbox,
  en_proceso: Loader2,
  finalizado_ejecutor: CheckCircle2,
  completado: BadgeCheck,
  cancelado: XCircle,
};

export function GoservicesStatusSummary({ rows }: { rows: { status: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <ClipboardList className="size-4 text-[#04B1AF]" />
          Total
        </div>
        <p className="mt-2 text-2xl font-bold">{rows.length}</p>
      </div>
      {Object.entries(STATUS_LABELS).map(([status, label]) => {
        const Icon = STATUS_ICONS[status] ?? ClipboardList;
        const count = rows.filter((r) => r.status === status).length;
        return (
          <div key={status} className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Icon className="size-4 text-[#04B1AF]" />
              {label}
            </div>
            <p className="mt-2 text-2xl font-bold">{count}</p>
          </div>
        );
      })}
    </div>
  );
}
