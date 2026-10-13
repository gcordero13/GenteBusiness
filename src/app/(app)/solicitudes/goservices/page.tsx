import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyGoservicesRequests } from "./actions";
import { NewGoservicesRequestDialog } from "./NewGoservicesRequestDialog";
import { GoservicesRefreshButton } from "./GoservicesRefreshButton";
import { GoservicesStatusSummary } from "./GoservicesStatusSummary";
import { GoservicesTicketExplorer } from "./GoservicesTicketExplorer";

export default async function GoservicesRequestsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_view && !flagsRows?.[0]?.can_add) {
    redirect("/");
  }

  const requests = await listMyGoservicesRequests();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Mis solicitudes GoServices</h1>
            <p className="text-sm text-muted-foreground">
              Consulta el estatus de tus solicitudes de mantenimiento y mensajería.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GoservicesRefreshButton />
            <NewGoservicesRequestDialog />
          </div>
        </div>
        <GoservicesStatusSummary rows={requests} />
        <GoservicesTicketExplorer requests={requests} mode={{ kind: "readonly" }} />
      </div>
    </div>
  );
}
