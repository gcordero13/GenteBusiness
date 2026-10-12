import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAllGoservicesRequests, listAssignableUsers } from "../solicitudes/goservices/actions";
import { GoservicesStatusSummary } from "../solicitudes/goservices/GoservicesStatusSummary";
import { NewGoservicesRequestDialog } from "../solicitudes/goservices/NewGoservicesRequestDialog";
import { GoservicesRefreshButton } from "../solicitudes/goservices/GoservicesRefreshButton";
import { GoservicesExportButton } from "./GoservicesExportButton";
import { GoservicesGestionView } from "./GoservicesGestionView";

export default async function GoservicesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "goservices",
  });
  if (!flagsRows?.[0]?.can_authorize) {
    redirect("/");
  }

  const [requests, allRequests, assignableUsers] = await Promise.all([
    listAllGoservicesRequests({ type }),
    listAllGoservicesRequests({}),
    listAssignableUsers(),
  ]);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">GoServices — Todas las solicitudes</h1>
            <p className="text-sm text-muted-foreground">
              Vista de gestión: asigna responsables y actualiza el estatus de cada ticket.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GoservicesRefreshButton />
            <NewGoservicesRequestDialog />
            <GoservicesExportButton rows={allRequests} />
          </div>
        </div>
        <GoservicesStatusSummary rows={allRequests} />
        <GoservicesGestionView type={type ?? null} requests={requests} mode={{ kind: "gestor", assignableUsers }} />
      </div>
    </div>
  );
}
