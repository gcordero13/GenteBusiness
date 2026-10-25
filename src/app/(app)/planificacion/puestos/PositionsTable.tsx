"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setPositionStatus, type PositionRow } from "./actions";

export function PositionsTable({ positions }: { positions: PositionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleStatus(p: PositionRow) {
    startTransition(async () => {
      await setPositionStatus(p.id, p.status === "activo" ? "inactivo" : "activo");
      router.refresh();
    });
  }

  if (positions.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Todavía no has creado ningún puesto.</p>;
  }

  return (
    <div className="space-y-3">
      {positions.map((p) => (
        <div key={p.id} className={`rounded-xl border p-3 ${p.status === "inactivo" ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-foreground">{p.name}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => toggleStatus(p)}
              className={p.status === "activo" ? "text-red-600" : "text-emerald-700"}
            >
              {p.status === "activo" ? "Desactivar" : "Activar"}
            </Button>
          </div>
          <div className="mt-2 space-y-1">
            {p.objectives.map((o) => (
              <p key={o.id} className="text-xs text-muted-foreground">
                {o.title} · {o.kpiMetric}
                {o.suggestedTarget != null ? ` · Meta sugerida: ${o.suggestedTarget}${o.unit ? ` ${o.unit}` : ""}` : ""}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
