import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAllGoservicesRequests, listAssignableUsers } from "../solicitudes/goservices/actions";
import { GoservicesFilterBar } from "./GoservicesFilterBar";
import { GoservicesStatusSummary } from "../solicitudes/goservices/GoservicesStatusSummary";
import { GoservicesTicketExplorer } from "../solicitudes/goservices/GoservicesTicketExplorer";

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
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const [requests, allRequests, mantenimientoUsers, mensajeriaUsers] = await Promise.all([
    listAllGoservicesRequests({ type }),
    listAllGoservicesRequests({}),
    listAssignableUsers("mantenimiento"),
    listAssignableUsers("mensajeria"),
  ]);
  const assignableUsersByType = { mantenimiento: mantenimientoUsers, mensajeria: mensajeriaUsers };

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">GoServices — Todas las solicitudes</h1>
          <p className="text-sm text-muted-foreground">
            Vista de gestión: asigna responsables y actualiza el estatus de cada ticket.
          </p>
        </div>
        <GoservicesStatusSummary rows={allRequests} />
        <GoservicesFilterBar type={type ?? null} />
        <GoservicesTicketExplorer requests={requests} mode={{ kind: "gestor", assignableUsersByType }} />
      </div>
    </div>
  );
}
