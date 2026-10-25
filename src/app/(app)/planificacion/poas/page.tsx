import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPoa } from "../actions";
import { ComplianceView } from "../ComplianceView";
import { LogUpdateDialog } from "./LogUpdateDialog";

export default async function MiPoaPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  const flags = flagsRows?.[0];
  if (!flags?.can_view && !flags?.can_manage && !flags?.can_authorize) {
    redirect("/");
  }

  const currentYear = new Date().getFullYear();
  const poa = await getMyPoa(currentYear);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi POA {currentYear}</h1>
          <p className="text-sm text-muted-foreground">Tus objetivos del año y su avance.</p>
        </div>

        {!poa ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              Todavía no tienes un POA asignado para {currentYear}. Pide a tu líder que te lo asigne.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {poa.positionName && (
              <p className="text-xs text-muted-foreground">
                Puesto: {poa.positionName} · Departamento: {poa.departmentName ?? "—"}
              </p>
            )}
            {poa.objectives.map((o) => (
              <div key={o.id} className="space-y-2">
                <ComplianceView objective={o} />
                <div className="flex justify-end">
                  <LogUpdateDialog objectiveId={o.id} objectiveTitle={o.title} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
