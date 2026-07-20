"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportContactsCsv } from "./actions";

export function ExportContactsButton() {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportContactsCsv({
        q: searchParams.get("q") ?? undefined,
        company: searchParams.get("company") ?? undefined,
        department: searchParams.get("department") ?? undefined,
        showInactive: searchParams.get("showInactive") ?? undefined,
      });
      if ("error" in result) {
        alert(result.error);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contactos.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={isPending}>
      <Download className="size-4" />
      Exportar CSV
    </Button>
  );
}
