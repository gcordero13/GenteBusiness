import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAllGoservicesRequests, listAssignableUsers } from "../solicitudes/goservices/actions";
import { GoservicesFilterBar } from "./GoservicesFilterBar";
import { AssignRequestSelect } from "./AssignRequestSelect";
import { AssignedRequestStatusSelect } from "../solicitudes/goservices/asignadas/AssignedRequestStatusSelect";
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

  const [requests, allRequests, users] = await Promise.all([
    listAllGoservicesRequests({ type }),
    listAllGoservicesRequests({}),
    listAssignableUsers(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">GoServices — Todas las solicitudes</h1>
      <GoservicesStatusSummary rows={allRequests} />
      <GoservicesFilterBar type={type ?? null} />
      <GoservicesTicketExplorer
        requests={requests}
        renderActions={(r) => (
          <div className="flex flex-wrap gap-2">
            <AssignRequestSelect requestId={r.id} assignedAppUserId={r.assignedAppUserId} users={users} />
            <AssignedRequestStatusSelect requestId={r.id} status={r.status} requestType={r.requestType} allStatuses />
          </div>
        )}
      />
    </div>
  );
}
