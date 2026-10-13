"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportSupplyArticlesCsv,
  importSupplyArticlesCsv,
  supplyArticlesTemplateCsv,
  type ImportSupplyArticlesResult,
} from "./actions";

function downloadCsv(filename: string, csv: string) {
  // A UTF-8 BOM so Excel (which this file is meant for) renders accented
  // characters like "categoría" correctly instead of mangling them.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ArticleImportExport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportSupplyArticlesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function downloadTemplate() {
    const csv = await supplyArticlesTemplateCsv();
    downloadCsv("plantilla-articulos.csv", csv);
  }

  function exportCurrent() {
    setError(null);
    startTransition(async () => {
      const res = await exportSupplyArticlesCsv();
      if (res.error || !res.csv) {
        setError(res.error ?? "No se pudo exportar");
        return;
      }
      downloadCsv(`articulos-${new Date().toISOString().slice(0, 10)}.csv`, res.csv);
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const text = await file.text();
      const res = await importSupplyArticlesCsv(text);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={isPending} className="gap-2">
          <FileSpreadsheet className="size-4" />
          Descargar plantilla
        </Button>
        <Button variant="outline" size="sm" onClick={exportCurrent} disabled={isPending} className="gap-2">
          <Download className="size-4" />
          Exportar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="gap-2"
        >
          <Upload className="size-4" />
          Importar
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded-lg bg-muted/60 p-2.5 text-xs text-foreground">
          <p>
            Importación completa: {result.created ?? 0} creados, {result.updated ?? 0} actualizados.
          </p>
          {result.skipped && result.skipped.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-700">
              {result.skipped.map((s) => (
                <li key={s.row}>
                  Fila {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
