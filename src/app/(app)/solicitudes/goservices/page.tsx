import { listMyGoservicesRequests } from "./actions";
import { NewGoservicesRequestDialog } from "./NewGoservicesRequestDialog";
import { GoservicesStatusSummary } from "./GoservicesStatusSummary";
import { GoservicesTicketExplorer } from "./GoservicesTicketExplorer";

export default async function GoservicesRequestsPage() {
  const requests = await listMyGoservicesRequests();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mis solicitudes GoServices</h1>
        <NewGoservicesRequestDialog />
      </div>
      <GoservicesStatusSummary rows={requests} />
      <GoservicesTicketExplorer requests={requests} mode={{ kind: "readonly" }} />
    </div>
  );
}
