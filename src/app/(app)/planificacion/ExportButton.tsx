"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPlanificacionCsv } from "./actions";

export function ExportReportButton({ periodYear }: { periodYear: number }) {
  const [isPending, startTransition] = useTransition();

  function exportCsv() {
    startTransition(async () => {
      const res = await exportPlanificacionCsv(periodYear);
      if (res.error || !res.csv) return;
      const blob = new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `planificacion-poas-${periodYear}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button variant="outline" onClick={exportCsv} disabled={isPending} className="gap-2">
      <Download className="size-4" />
      Exportar reporte
    </Button>
  );
}
