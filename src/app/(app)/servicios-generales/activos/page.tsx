import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMaintenanceAssets, listAssignableAppUsers } from "../actions";
import { AssetFormDialog } from "./AssetFormDialog";
import { AssetsTable } from "./AssetsTable";

export default async function ServiciosGeneralesAssetsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "servicios_generales" });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const [assets, users, { data: departments }] = await Promise.all([
    listMaintenanceAssets(),
    listAssignableAppUsers(),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Activos</h1>
            <p className="text-sm text-muted-foreground">
              Aires acondicionados, vehículos y demás activos que se les da seguimiento individual.
            </p>
          </div>
          <AssetFormDialog departments={departments ?? []} users={users} />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <AssetsTable assets={assets} departments={departments ?? []} users={users} />
        </div>
      </div>
    </div>
  );
}
