"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BOARD_STATUSES, STATUS_LABELS } from "../constants";
import type { SupplyRequestRow } from "../actions";

const COLUMN_ACCENT: Record<string, string> = {
  pendiente_aprobacion: "border-t-amber-400",
  aprobada: "border-t-emerald-400",
  editada_pendiente_reaprobacion: "border-t-amber-400",
  rechazada: "border-t-red-400",
  en_preparacion: "border-t-sky-400",
  parcial: "border-t-sky-400",
  entregada: "border-t-[#04B1AF]",
  cancelada: "border-t-muted-foreground/40",
};

export function TableroBoard({ requests }: { requests: SupplyRequestRow[] }) {
  const [open, setOpen] = useState<SupplyRequestRow | null>(null);

  const byStatus = new Map<string, SupplyRequestRow[]>();
  for (const status of BOARD_STATUSES) byStatus.set(status, []);
  for (const r of requests) byStatus.get(r.status)?.push(r);

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {BOARD_STATUSES.map((status) => {
          const columnRequests = byStatus.get(status) ?? [];
          return (
            <div
              key={status}
              className={`w-64 shrink-0 space-y-2.5 rounded-2xl border border-t-4 bg-card p-3 shadow-sm ${COLUMN_ACCENT[status]}`}
            >
              <div className="flex items-center justify-between px-0.5">
                <h3 className="text-xs font-semibold text-foreground">{STATUS_LABELS[status] ?? status}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {columnRequests.length}
                </span>
              </div>
              <div className="space-y-2">
                {columnRequests.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setOpen(r)}
                    className="w-full rounded-xl border bg-background p-2.5 text-left text-xs hover:bg-muted"
                  >
                    <p className="font-semibold text-foreground">#{r.requestNumber}</p>
                    <p className="truncate text-muted-foreground">{r.requesterName}</p>
                    <p className="mt-1 text-muted-foreground">
                      {r.items.length} artículo{r.items.length === 1 ? "" : "s"} · {r.createdAtLabel}
                    </p>
                  </button>
                ))}
                {columnRequests.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">Sin solicitudes</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitud #{open?.requestNumber}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Solicitante</span>
                <span className="font-medium text-foreground">{open.requesterName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Departamento</span>
                <span className="font-medium text-foreground">{open.requesterDepartmentName ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Aprobador</span>
                <span className="font-medium text-foreground">{open.approverName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado</span>
                <span className="font-semibold text-foreground">{open.statusLabel}</span>
              </div>
              {open.notes && <p className="rounded-lg bg-muted/60 p-2 text-xs text-foreground">{open.notes}</p>}
              <div className="space-y-2 rounded-xl border p-2.5">
                {open.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{item.articleName}</span>
                    <span className="text-muted-foreground">
                      Pedido {item.qtyRequested}
                      {item.qtyApproved !== null ? ` · Aprobado ${item.qtyApproved}` : ""}
                      {item.qtyDelivered !== null ? ` · Entregado ${item.qtyDelivered}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
