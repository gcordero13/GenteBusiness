"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CATEGORY_BY_KEY } from "../categories";
import { cancelMaintenanceSeries, reactivateMaintenanceSeries, type MaintenancePlanRow } from "../actions";

const FREQUENCY_UNIT_LABELS: Record<MaintenancePlanRow["frequencyUnit"], string> = {
  dias: "días",
  semanas: "semanas",
  meses: "meses",
};

export function PlansTable({ plans }: { plans: MaintenancePlanRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle(plan: MaintenancePlanRow) {
    startTransition(async () => {
      if (plan.isActive) await cancelMaintenanceSeries(plan.id);
      else await reactivateMaintenanceSeries(plan.id);
      router.refresh();
    });
  }

  if (plans.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Todavía no has creado ningún plan.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Categoría</th>
            <th className="pb-2 pr-3 font-medium">Activo / Descripción</th>
            <th className="pb-2 pr-3 font-medium">Departamento</th>
            <th className="pb-2 pr-3 font-medium">Frecuencia</th>
            <th className="pb-2 pr-3 font-medium">Estado</th>
            <th className="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => {
            const meta = CATEGORY_BY_KEY.get(p.category);
            return (
              <tr key={p.id} className={`border-b last:border-0 ${!p.isActive ? "opacity-50" : ""}`}>
                <td className="py-2 pr-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.badgeClass ?? ""}`}
                  >
                    <span className={`size-1.5 rounded-full ${meta?.dotClass ?? ""}`} />
                    {meta?.label ?? p.category}
                  </span>
                </td>
                <td className="max-w-[220px] py-2 pr-3">
                  <p className="truncate font-medium text-foreground">{p.assetName ?? p.description}</p>
                  {p.assetName && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{p.departmentName ?? "—"}</td>
                <td className="py-2 pr-3 text-muted-foreground">
                  Cada {p.frequencyInterval} {FREQUENCY_UNIT_LABELS[p.frequencyUnit]}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.isActive ? "Activo" : "Pausado"}
                  </span>
                </td>
                <td className="py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => toggle(p)}
                    className={p.isActive ? "text-red-600" : "text-emerald-700"}
                  >
                    {p.isActive ? "Pausar" : "Reanudar"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
