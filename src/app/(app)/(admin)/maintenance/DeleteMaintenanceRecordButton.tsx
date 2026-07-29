"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteMaintenanceRecord } from "./actions";

export function DeleteMaintenanceRecordButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("¿Cancelar este mantenimiento pendiente?")) return;
    startTransition(async () => {
      await deleteMaintenanceRecord(recordId);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDelete} disabled={isPending}>
      Cancelar
    </Button>
  );
}
