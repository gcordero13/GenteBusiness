import { listMyGoservicesRequests } from "./actions";
import { NewGoservicesRequestDialog } from "./NewGoservicesRequestDialog";
import { GoservicesStatusSummary } from "./GoservicesStatusSummary";
import { GoservicesTicketExplorer } from "./GoservicesTicketExplorer";

export default async function GoservicesRequestsPage() {
  const requests = await listMyGoservicesRequests();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Mis solicitudes GoServices</h1>
            <p className="text-sm text-muted-foreground">
              Consulta el estatus de tus solicitudes de mantenimiento y mensajería.
            </p>
          </div>
          <NewGoservicesRequestDialog />
        </div>
        <GoservicesStatusSummary rows={requests} />
        <GoservicesTicketExplorer requests={requests} mode={{ kind: "readonly" }} />
      </div>
    </div>
  );
}
