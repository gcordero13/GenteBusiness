"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_BY_KEY, VEHICLE_SERVICE_TYPE_LABELS } from "./categories";
import { completeMaintenanceRecord, cancelMaintenanceRecord, type MaintenanceRecordRow } from "./actions";

export function MaintenanceListView({
  records,
  canManage,
  onSelectRecord,
}: {
  records: MaintenanceRecordRow[];
  canManage: boolean;
  onSelectRecord: (record: MaintenanceRecordRow) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function complete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    startTransition(async () => {
      await completeMaintenanceRecord(id);
      router.refresh();
    });
  }

  function cancel(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    startTransition(async () => {
      await cancelMaintenanceRecord(id);
      router.refresh();
    });
  }

  if (records.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No hay mantenimientos que coincidan.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Fecha</th>
            <th className="pb-2 pr-3 font-medium">Tipo</th>
            <th className="pb-2 pr-3 font-medium">Artículo / Descripción</th>
            <th className="pb-2 pr-3 font-medium">Área</th>
            <th className="pb-2 pr-3 font-medium">Gasto</th>
            <th className="pb-2 pr-3 font-medium">Estado</th>
            {canManage && <th className="pb-2 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const meta = CATEGORY_BY_KEY.get(r.category);
            return (
              <tr
                key={r.id}
                onClick={() => onSelectRecord(r)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
              >
                <td className="py-2 pr-3 whitespace-nowrap">
                  {r.scheduledDate}
                  {r.scheduledTime && <span className="text-muted-foreground"> {r.scheduledTime.slice(0, 5)}</span>}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.badgeClass ?? ""}`}
                  >
                    <span className={`size-1.5 rounded-full ${meta?.dotClass ?? ""}`} />
                    {meta?.label ?? r.category}
                  </span>
                </td>
                <td className="max-w-[220px] py-2 pr-3">
                  <p className="truncate font-medium text-foreground">{r.assetName ?? r.description}</p>
                  {r.assetName && <p className="truncate text-xs text-muted-foreground">{r.description}</p>}
                  {r.vehicleServiceType && (
                    <p className="truncate text-xs text-muted-foreground">
                      {VEHICLE_SERVICE_TYPE_LABELS[r.vehicleServiceType]}
                      {r.mileageAtService != null ? ` · ${r.mileageAtService.toLocaleString()} mi` : ""}
                      {r.nextDueDate ? ` · Vence ${r.nextDueDate}` : ""}
                    </p>
                  )}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{r.departmentName ?? "—"}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                  {r.cost != null ? `$${r.cost.toFixed(2)}` : "—"}
                  {r.vendorName && <span className="block text-xs">{r.vendorName}</span>}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.status === "vencido"
                        ? "bg-red-50 text-red-700"
                        : r.status === "completado"
                          ? "bg-emerald-50 text-emerald-700"
                          : r.status === "cancelado"
                            ? "bg-muted text-muted-foreground"
                            : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {r.status === "programado"
                      ? "Programado"
                      : r.status === "vencido"
                        ? "Vencido"
                        : r.status === "completado"
                          ? "Completado"
                          : "Cancelado"}
                  </span>
                </td>
                {canManage && (
                  <td className="py-2">
                    {(r.status === "programado" || r.status === "vencido") && (
                      <div className="flex gap-1.5">
                        <Button
                          size="icon-sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={(e) => complete(e, r.id)}
                          title="Marcar completado"
                        >
                          <Check className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={(e) => cancel(e, r.id)}
                          title="Cancelar"
                          className="text-red-600"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
