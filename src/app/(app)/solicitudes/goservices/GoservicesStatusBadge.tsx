import { STATUS_COLORS } from "@/lib/goservicesStatus";

export function GoservicesStatusBadge({ status, label }: { status: string; label: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.recibido;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
    >
      <span className={`size-1.5 rounded-full ${colors.dot}`} />
      {label}
    </span>
  );
}
