"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteMaintenanceRecord } from "./actions";

export function DeleteMaintenanceRecordButton({ recordId, status }: { recordId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmMessage =
      status === "completado"
        ? "Este mantenimiento ya está COMPLETADO. ¿Eliminarlo de todas formas? Esta acción no se puede deshacer y borra el reporte, la encuesta y el historial asociado."
        : "¿Cancelar este mantenimiento pendiente?";
    if (!confirm(confirmMessage)) return;
    startTransition(async () => {
      await deleteMaintenanceRecord(recordId);
      router.refresh();
    });
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={handleDelete}
      disabled={isPending}
      title={status === "completado" ? "Eliminar" : "Cancelar"}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
