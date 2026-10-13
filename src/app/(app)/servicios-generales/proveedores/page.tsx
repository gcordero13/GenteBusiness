import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMaintenanceVendors } from "../actions";
import { VendorFormDialog } from "./VendorFormDialog";
import { VendorsTable } from "./VendorsTable";

export default async function ServiciosGeneralesVendorsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "servicios_generales" });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const vendors = await listMaintenanceVendors();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Proveedores</h1>
            <p className="text-sm text-muted-foreground">Talleres, ferreterías y demás proveedores para seleccionar al registrar un gasto.</p>
          </div>
          <VendorFormDialog />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <VendorsTable vendors={vendors} />
        </div>
      </div>
    </div>
  );
}
