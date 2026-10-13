import { redirect } from "next/navigation";
import Link from "next/link";
import { Repeat, Truck, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listAllMaintenanceRecords, listMaintenanceAssets, listMaintenanceVendors } from "./actions";
import { MAINTENANCE_CATEGORIES } from "./categories";
import { CreateMaintenanceDialog } from "./CreateMaintenanceDialog";
import { ExportReportButton } from "./ExportButton";
import { ServiciosGeneralesWorkspace } from "./ServiciosGeneralesWorkspace";
import { Button } from "@/components/ui/button";

export default async function ServiciosGeneralesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "servicios_generales" });
  const canManage = Boolean(flagsRows?.[0]?.can_manage);
  const canView = Boolean(flagsRows?.[0]?.can_view);
  if (!canView && !canManage) {
    redirect("/");
  }

  const [records, assets, vendors, { data: departments }] = await Promise.all([
    listAllMaintenanceRecords(),
    canManage ? listMaintenanceAssets({ activeOnly: true }) : Promise.resolve([]),
    canManage ? listMaintenanceVendors({ activeOnly: true }) : Promise.resolve([]),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Servicios Generales</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona y da seguimiento a todos los mantenimientos de la empresa en un solo lugar.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="gap-2" render={<Link href="/servicios-generales/activos" />}>
                <Wrench className="size-4" />
                Activos
              </Button>
              <Button variant="outline" className="gap-2" render={<Link href="/servicios-generales/proveedores" />}>
                <Truck className="size-4" />
                Proveedores
              </Button>
              <Button variant="outline" className="gap-2" render={<Link href="/servicios-generales/planes" />}>
                <Repeat className="size-4" />
                Planes
              </Button>
              <ExportReportButton />
              <CreateMaintenanceDialog departments={departments ?? []} assets={assets} vendors={vendors} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MAINTENANCE_CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-white ${c.dotClass}`}>
                <c.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.example}</p>
              </div>
            </div>
          ))}
        </div>

        <ServiciosGeneralesWorkspace records={records} canManage={canManage} />
      </div>
    </div>
  );
}
