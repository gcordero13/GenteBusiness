"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoservicesRequestRow } from "../solicitudes/goservices/actions";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(rows: GoservicesRequestRow[]): string {
  const headers = [
    "Ticket",
    "Tipo",
    "Categoría/Detalle de tipo",
    "Solicitante",
    "Departamento",
    "Detalle",
    "Estatus",
    "Asignado a",
    "Fecha de creación",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        String(r.requestNumber),
        r.requestType === "mantenimiento" ? "Mantenimiento" : "Mensajería",
        r.typeLabel,
        r.requesterName,
        r.departmentName ?? "",
        r.detalle,
        r.statusLabel,
        r.assignedAppUserEmail ?? "Sin asignar",
        r.createdAtLabel,
      ]
        .map((v) => csvEscape(v))
        .join(","),
    );
  }
  return lines.join("\n");
}

export function GoservicesExportButton({ rows }: { rows: GoservicesRequestRow[] }) {
  function handleExport() {
    const csv = buildCsv(rows);
    // Prepend a UTF-8 BOM so Excel opens accented characters (á, é, í, ó, ú, ñ) correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `goservices-reporte-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
      <Download className="size-4" />
      Exportar reporte
    </Button>
  );
}
