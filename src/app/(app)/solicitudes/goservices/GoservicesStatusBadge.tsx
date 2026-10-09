import { STATUS_COLORS } from "@/lib/goservicesStatus";

export function GoservicesStatusBadge({ status, label }: { status: string; label: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.recibido;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${colors.bg} ${colors.text} ${colors.border}`}
    >
      <span className={`size-1.5 rounded-full ring-2 ring-white/60 ${colors.dot}`} />
      {label}
    </span>
  );
}
