"use client";

import { CATEGORY_BY_KEY, STATUS_LABELS } from "./categories";
import type { MaintenanceRecordRow } from "./actions";

const BOARD_STATUSES = ["programado", "vencido", "completado", "cancelado"] as const;

const COLUMN_ACCENT: Record<(typeof BOARD_STATUSES)[number], string> = {
  programado: "border-t-amber-400",
  vencido: "border-t-red-400",
  completado: "border-t-emerald-400",
  cancelado: "border-t-muted-foreground/40",
};

export function MaintenanceBoardView({
  records,
  onSelectRecord,
}: {
  records: MaintenanceRecordRow[];
  onSelectRecord: (record: MaintenanceRecordRow) => void;
}) {
  const byStatus = new Map<string, MaintenanceRecordRow[]>();
  for (const status of BOARD_STATUSES) byStatus.set(status, []);
  for (const r of records) byStatus.get(r.status)?.push(r);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {BOARD_STATUSES.map((status) => {
        const columnRecords = byStatus.get(status) ?? [];
        return (
          <div
            key={status}
            className={`w-64 shrink-0 space-y-2.5 rounded-2xl border border-t-4 bg-card p-3 shadow-sm ${COLUMN_ACCENT[status]}`}
          >
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-semibold text-foreground">{STATUS_LABELS[status] ?? status}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {columnRecords.length}
              </span>
            </div>
            <div className="space-y-2">
              {columnRecords.map((r) => {
                const meta = CATEGORY_BY_KEY.get(r.category);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onSelectRecord(r)}
                    className="w-full rounded-xl border bg-background p-2.5 text-left text-xs hover:bg-muted"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className={`size-1.5 shrink-0 rounded-full ${meta?.dotClass ?? ""}`} />
                      <span className="font-semibold text-foreground">{meta?.label ?? r.category}</span>
                    </div>
                    <p className="truncate text-muted-foreground">{r.assetName ?? r.description}</p>
                    <p className="mt-1 text-muted-foreground">
                      {r.scheduledDate}
                      {r.scheduledTime ? ` · ${r.scheduledTime.slice(0, 5)}` : ""}
                    </p>
                  </button>
                );
              })}
              {columnRecords.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">Sin mantenimientos</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
