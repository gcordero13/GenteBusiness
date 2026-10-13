"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { decideSupplyRequest, type SupplyRequestRow } from "./actions";

// Shown on everyone's own /suministros page when they're the approver for
// at least one pending request — approval isn't gated by any permission
// flag, it's whoever sits above the requester in the org chart.
export function ApprovalsPanel({ requests }: { requests: SupplyRequestRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<SupplyRequestRow | null>(null);
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [mode, setMode] = useState<"review" | "reject">("review");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (requests.length === 0) return null;

  function openRequest(r: SupplyRequestRow) {
    setOpen(r);
    setMode("review");
    setError(null);
    setRejectReason("");
    setQtyByItem(Object.fromEntries(r.items.map((i) => [i.id, i.qtyApproved ?? i.qtyRequested])));
  }

  function approve() {
    if (!open) return;
    setError(null);
    startTransition(async () => {
      const result = await decideSupplyRequest(
        open.id,
        "aprobada",
        open.items.map((i) => ({ itemId: i.id, qtyApproved: Math.max(0, qtyByItem[i.id] ?? i.qtyRequested) })),
        "",
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(null);
      router.refresh();
    });
  }

  function reject() {
    if (!open) return;
    if (!rejectReason.trim()) {
      setError("Indica el motivo del rechazo");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await decideSupplyRequest(open.id, "rechazada", [], rejectReason);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-[#04B1AF]/30 bg-[#04B1AF]/[0.04] p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        Solicitudes para tu aprobación ({requests.length})
      </h3>
      <div className="space-y-2.5">
        {requests.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => openRequest(r)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm hover:bg-muted"
          >
            <div>
              <p className="font-semibold text-foreground">
                #{r.requestNumber} · {r.requesterName}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.requesterDepartmentName ?? "Sin departamento"} · {r.items.length} artículo
                {r.items.length === 1 ? "" : "s"} · {r.createdAtLabel}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              {r.statusLabel}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitud #{open?.requestNumber}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <p className="text-xs text-muted-foreground">
                {open.requesterName} · {open.requesterDepartmentName ?? "Sin departamento"}
              </p>
              {open.notes && <p className="rounded-lg bg-muted/60 p-2 text-xs text-foreground">{open.notes}</p>}

              {mode === "review" ? (
                <div className="space-y-2">
                  {open.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.articleName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.unit} · Solicitado: {item.qtyRequested}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={item.qtyRequested}
                        value={qtyByItem[item.id] ?? item.qtyRequested}
                        onChange={(e) =>
                          setQtyByItem((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                        }
                        className="w-20 text-center"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Ajusta la cantidad a aprobar por artículo si no vas a aprobar todo lo solicitado.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-muted-foreground">Motivo del rechazo</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {mode === "review" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setMode("reject")}
                  disabled={isPending}
                  className="flex-1 gap-2 border-red-200 text-red-700 hover:bg-red-50"
                >
                  <X className="size-4" />
                  Rechazar
                </Button>
                <Button onClick={approve} disabled={isPending} className="flex-1 gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
                  <Check className="size-4" />
                  Aprobar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setMode("review")} disabled={isPending} className="flex-1">
                  Volver
                </Button>
                <Button onClick={reject} disabled={isPending} variant="destructive" className="flex-1">
                  Confirmar rechazo
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
