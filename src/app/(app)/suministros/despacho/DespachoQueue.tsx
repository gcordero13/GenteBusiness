"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDispatchDelivery, markRequestInPreparation, type SupplyRequestRow } from "../actions";

const STAGES = ["Aprobada", "Preparación", "Verificación", "Entrega", "Cierre"] as const;

function stageIndex(status: string): number {
  if (status === "aprobada") return 0;
  if (status === "en_preparacion") return 1;
  if (status === "parcial") return 3;
  if (status === "entregada") return 4;
  return 0;
}

export function DespachoQueue({
  requests,
  stockByArticleName,
}: {
  requests: SupplyRequestRow[];
  stockByArticleName: Record<string, number>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(requests[0]?.id ?? null);
  const [deliverByItem, setDeliverByItem] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  function select(r: SupplyRequestRow) {
    setSelectedId(r.id);
    setError(null);
    setDeliverByItem(
      Object.fromEntries(r.items.map((i) => [i.id, i.qtyDelivered ?? i.qtyApproved ?? i.qtyRequested])),
    );
  }

  function startPreparation() {
    if (!selected) return;
    startTransition(async () => {
      const result = await markRequestInPreparation(selected.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function confirmDelivery() {
    if (!selected) return;
    setError(null);
    const deliveries = selected.items.map((item) => {
      const cap = item.qtyApproved ?? item.qtyRequested;
      const qty = Math.min(cap, Math.max(0, deliverByItem[item.id] ?? 0));
      return { itemId: item.id, articleId: item.articleId, qtyPrepared: qty, qtyDelivered: qty };
    });
    startTransition(async () => {
      const result = await confirmDispatchDelivery(selected.id, deliveries);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">No hay solicitudes pendientes de despacho.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-5">
      <div className="min-w-[260px] flex-1 space-y-2.5 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Cola de despacho ({requests.length})</h3>
        {requests.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => select(r)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm ${
              r.id === selectedId ? "border-[#04B1AF] bg-[#04B1AF]/[0.06]" : "hover:bg-muted"
            }`}
          >
            <div>
              <p className="font-semibold text-foreground">
                #{r.requestNumber} · {r.requesterName}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.requesterDepartmentName ?? "Sin departamento"} · {r.statusLabel}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="min-w-[320px] flex-[999_1_480px] space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        {!selected ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Selecciona una solicitud.</p>
        ) : (
          <>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              {STAGES.map((stage, idx) => (
                <div key={stage} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      idx <= stageIndex(selected.status)
                        ? "bg-[#04B1AF] text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{stage}</span>
                  {idx < STAGES.length - 1 && <div className="h-px flex-1 bg-border" />}
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground">
                #{selected.requestNumber} · {selected.requesterName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selected.requesterDepartmentName ?? "Sin departamento"} · Aprobó: {selected.approverName}
              </p>
            </div>

            <div className="space-y-2">
              {selected.items.map((item) => {
                const cap = item.qtyApproved ?? item.qtyRequested;
                const stock = stockByArticleName[item.articleName];
                const lowStock = typeof stock === "number" && stock < cap;
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.articleName}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {item.unit} · Aprobado: {cap}
                        {typeof stock === "number" && (
                          <span className={lowStock ? "text-red-600" : ""}>· Stock: {stock}</span>
                        )}
                        {lowStock && <AlertTriangle className="size-3 text-red-600" />}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={cap}
                      value={deliverByItem[item.id] ?? cap}
                      onChange={(e) =>
                        setDeliverByItem((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                      }
                      className="w-20 text-center"
                    />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Cantidad a despachar por artículo (no puede superar lo aprobado).
              </p>
            </div>

            <div className="flex gap-2">
              {selected.status === "aprobada" && (
                <Button
                  onClick={startPreparation}
                  disabled={isPending}
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  <Truck className="size-4" />
                  Marcar en preparación
                </Button>
              )}
              <Button
                onClick={confirmDelivery}
                disabled={isPending}
                className="flex-1 gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
              >
                <PackageCheck className="size-4" />
                Confirmar entrega
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
