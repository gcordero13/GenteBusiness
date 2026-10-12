"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";
import { updateGoservicesRequestStatus } from "./actions";
import type { GoservicesRequestRow } from "./actions";

const COLUMN_ORDER = Object.keys(STATUS_LABELS) as GoservicesStatus[];

const REQUEST_TYPE_LABELS: Record<GoservicesRequestRow["requestType"], string> = {
  mantenimiento: "Mantenimiento",
  mensajeria: "Mensajería",
};

// "Finalizado por ejecutor" only has meaning for mantenimiento tickets (see
// AssignedRequestStatusSelect) — dropping a mensajería card into that column
// would set a status the rest of the app never expects for that type.
function isValidDrop(request: GoservicesRequestRow, target: GoservicesStatus): boolean {
  if (target === "finalizado_ejecutor" && request.requestType !== "mantenimiento") return false;
  return request.status !== target;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Kanban-style board: one column per status (what the user calls a "lista"
// in the Trello sense), so a supervisor can see at a glance which bucket
// every ticket currently sits in. Cards are draggable between columns to
// change status directly, confirmed with the user ("el modo tablero quiero
// poder moverlo al estado que yo quiera").
export function GoservicesBoardView({
  requests,
  onSelect,
}: {
  requests: GoservicesRequestRow[];
  onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => {
    const byStatus = new Map<string, GoservicesRequestRow[]>();
    for (const status of COLUMN_ORDER) byStatus.set(status, []);
    for (const r of requests) {
      const bucket = byStatus.get(r.status);
      if (bucket) bucket.push(r);
      else byStatus.set(r.status, [r]);
    }
    for (const bucket of byStatus.values()) {
      bucket.sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime());
    }
    return byStatus;
  }, [requests]);

  function handleDrop(target: GoservicesStatus) {
    setDragOverStatus(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const request = requests.find((r) => r.id === id);
    if (!request || !isValidDrop(request, target)) return;

    setError(null);
    startTransition(async () => {
      const result = await updateGoservicesRequestStatus(id, target);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex w-full min-w-0 gap-3 overflow-x-auto rounded-2xl border border-border bg-card p-3 shadow-md md:h-[70vh] md:max-h-[44rem] md:min-h-[28rem]">
        {COLUMN_ORDER.map((status) => {
          const colors = STATUS_COLORS[status] ?? STATUS_COLORS.recibido;
          const items = columns.get(status) ?? [];
          const isDragOver = dragOverStatus === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverStatus !== status) setDragOverStatus(status);
              }}
              onDragLeave={() => setDragOverStatus((prev) => (prev === status ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(status);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors md:h-full",
                isDragOver ? "border-[#04B1AF] bg-[#04B1AF]/5 ring-2 ring-[#04B1AF]/30" : "border-border/60",
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-t-xl border-b px-3 py-2",
                  colors.bg,
                  colors.border,
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-sm font-semibold", colors.text)}>
                  <span className={cn("size-1.5 rounded-full", colors.dot)} />
                  {STATUS_LABELS[status]}
                </span>
                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2 md:max-h-none">
                {items.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {isDragOver ? "Suelta aquí" : "Sin solicitudes"}
                  </p>
                ) : (
                  items.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      draggable
                      onDragStart={() => setDraggingId(r.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverStatus(null);
                      }}
                      onClick={() => onSelect(r.id)}
                      className={cn(
                        "flex w-full cursor-grab flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 text-left shadow-sm transition-colors active:cursor-grabbing hover:border-[#04B1AF]/40 hover:bg-[#04B1AF]/5",
                        draggingId === r.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarFallback className="bg-[#04B1AF]/15 text-[10px] text-[#04B1AF]">
                            {initials(r.requesterName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">
                            <span className="font-normal text-muted-foreground">#{r.requestNumber}</span> ·{" "}
                            {r.requesterName}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {REQUEST_TYPE_LABELS[r.requestType]}
                          </p>
                        </div>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.assignedAppUserEmail ?? "Sin asignar"}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground/80">{r.createdAtLabel}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
