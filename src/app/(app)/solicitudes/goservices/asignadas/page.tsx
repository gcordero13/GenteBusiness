import { listAssignedGoservicesRequests } from "../actions";
import { GoservicesStatusSummary } from "../GoservicesStatusSummary";
import { GoservicesTicketExplorer } from "../GoservicesTicketExplorer";

export default async function GoservicesAssignedPage() {
  const requests = await listAssignedGoservicesRequests();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mis tareas asignadas</h1>
          <p className="text-sm text-muted-foreground">
            Tickets de GoServices asignados a ti para dar seguimiento.
          </p>
        </div>
        <GoservicesStatusSummary rows={requests} />
        <GoservicesTicketExplorer requests={requests} mode={{ kind: "ejecutor" }} />
      </div>
    </div>
  );
}
