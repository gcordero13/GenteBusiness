"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportServiciosGeneralesCsv } from "./actions";

export function ExportReportButton() {
  const [isPending, startTransition] = useTransition();

  function exportCsv() {
    startTransition(async () => {
      const res = await exportServiciosGeneralesCsv();
      if (res.error || !res.csv) return;
      const blob = new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `servicios-generales-${new Date().toISOString().slice(0, 10)}.csv`;
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
