import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMaintenancePlans, listMaintenanceAssets, listMaintenanceVendors } from "../actions";
import { CreateMaintenanceDialog } from "../CreateMaintenanceDialog";
import { PlansTable } from "./PlansTable";

export default async function ServiciosGeneralesPlansPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "servicios_generales" });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const [plans, assets, vendors, { data: departments }] = await Promise.all([
    listMaintenancePlans(),
    listMaintenanceAssets({ activeOnly: true }),
    listMaintenanceVendors({ activeOnly: true }),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Planes de mantenimiento</h1>
            <p className="text-sm text-muted-foreground">
              Reglas recurrentes (ej. cambio de aceite cada 3 meses) - cada plan genera su próxima fecha
              automáticamente al completarse.
            </p>
          </div>
          <CreateMaintenanceDialog departments={departments ?? []} assets={assets} vendors={vendors} forcePlan />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <PlansTable plans={plans} />
        </div>
      </div>
    </div>
  );
}
