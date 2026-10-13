"use client";

import { useTransition } from "react";
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
import { CATEGORY_BY_KEY, STATUS_LABELS, VEHICLE_SERVICE_TYPE_LABELS } from "./categories";
import { completeMaintenanceRecord, cancelMaintenanceRecord, type MaintenanceRecordRow } from "./actions";

export function MaintenanceDetailModal({
  record,
  canManage,
  onClose,
}: {
  record: MaintenanceRecordRow | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function complete() {
    if (!record) return;
    startTransition(async () => {
      await completeMaintenanceRecord(record.id);
      onClose();
      router.refresh();
    });
  }

  function cancel() {
    if (!record) return;
    startTransition(async () => {
      await cancelMaintenanceRecord(record.id);
      onClose();
      router.refresh();
    });
  }

  const meta = record ? CATEGORY_BY_KEY.get(record.category) : undefined;
  const canAct = canManage && record && record.status !== "completado" && record.status !== "cancelado";

  return (
    <Dialog open={Boolean(record)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{record?.assetName ?? meta?.label ?? "Mantenimiento"}</DialogTitle>
        </DialogHeader>
        {record && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.badgeClass ?? ""}`}
              >
                <span className={`size-1.5 rounded-full ${meta?.dotClass ?? ""}`} />
                {meta?.label ?? record.category}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {STATUS_LABELS[record.status] ?? record.status}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha</span>
              <span className="font-medium text-foreground">
                {record.scheduledDate}
                {record.scheduledTime ? ` · ${record.scheduledTime.slice(0, 5)}` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Departamento</span>
              <span className="font-medium text-foreground">{record.departmentName ?? "—"}</span>
            </div>
            {record.assetName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Activo</span>
                <span className="font-medium text-foreground">{record.assetName}</span>
              </div>
            )}

            <p className="rounded-lg bg-muted/60 p-2 text-sm text-foreground">{record.description}</p>

            {record.vehicleServiceType && (
              <div className="space-y-1.5 rounded-xl border p-2.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo de chequeo</span>
                  <span className="font-medium text-foreground">
                    {VEHICLE_SERVICE_TYPE_LABELS[record.vehicleServiceType]}
                  </span>
                </div>
                {record.mileageAtService != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kilometraje</span>
                    <span className="font-medium text-foreground">{record.mileageAtService.toLocaleString()} mi</span>
                  </div>
                )}
                {record.nextDueMileage != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Próximo cambio</span>
                    <span className="font-medium text-foreground">{record.nextDueMileage.toLocaleString()} mi</span>
                  </div>
                )}
                {record.nextDueDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Próximo vencimiento</span>
                    <span className="font-medium text-foreground">{record.nextDueDate}</span>
                  </div>
                )}
              </div>
            )}

            {(record.cost != null || record.vendorName) && (
              <div className="flex justify-between rounded-xl border p-2.5">
                <span className="text-muted-foreground">Gasto</span>
                <span className="font-medium text-foreground">
                  {record.cost != null ? `$${record.cost.toFixed(2)}` : "—"}
                  {record.vendorName ? ` · ${record.vendorName}` : ""}
                </span>
              </div>
            )}

            {record.seriesId && (
              <p className="text-xs text-muted-foreground">Parte de un plan de mantenimiento recurrente.</p>
            )}
          </div>
        )}
        {canAct && (
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={cancel}
              className="flex-1 gap-2 border-red-200 text-red-700 hover:bg-red-50"
            >
              <X className="size-4" />
              Cancelar
            </Button>
            <Button onClick={complete} disabled={isPending} className="flex-1 gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
              <Check className="size-4" />
              Marcar completado
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
