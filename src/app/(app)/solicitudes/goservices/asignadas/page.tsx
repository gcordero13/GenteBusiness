import { listAssignedGoservicesRequests } from "../actions";
import { GoservicesStatusSummary } from "../GoservicesStatusSummary";
import { GoservicesTicketExplorer } from "../GoservicesTicketExplorer";

export default async function GoservicesAssignedPage() {
  const requests = await listAssignedGoservicesRequests();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Mis tareas asignadas</h1>
      <GoservicesStatusSummary rows={requests} />
      <GoservicesTicketExplorer requests={requests} mode={{ kind: "ejecutor" }} />
    </div>
  );
}
