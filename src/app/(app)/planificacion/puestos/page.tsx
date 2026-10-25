import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listPositions } from "./actions";
import { PositionFormDialog } from "./PositionFormDialog";
import { PositionsTable } from "./PositionsTable";

export default async function PlanificacionPuestosPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  if (!flagsRows?.[0]?.can_authorize) {
    redirect("/");
  }

  const positions = await listPositions();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Puestos y KPIs</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo único de puestos con su plantilla de objetivos/KPIs, para toda la empresa.
            </p>
          </div>
          <PositionFormDialog />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <PositionsTable positions={positions} />
        </div>
      </div>
    </div>
  );
}
