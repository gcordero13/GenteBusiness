import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listAllGoservicesRequests, listAssignableUsers } from "../solicitudes/goservices/actions";
import { GoservicesFilterBar } from "./GoservicesFilterBar";
import { AssignRequestSelect } from "./AssignRequestSelect";
import { AssignedRequestStatusSelect } from "../solicitudes/goservices/asignadas/AssignedRequestStatusSelect";
import { GoservicesRequestDetailDialog } from "../solicitudes/goservices/GoservicesRequestDetailDialog";
import { GoservicesStatusSummary } from "../solicitudes/goservices/GoservicesStatusSummary";

export default async function GoservicesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { type, status } = await searchParams;

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "goservices",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const [requests, allRequests, users] = await Promise.all([
    listAllGoservicesRequests({ type, status }),
    listAllGoservicesRequests({}),
    listAssignableUsers(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">GoServices — Todas las solicitudes</h1>
      <GoservicesStatusSummary rows={allRequests} />
      <GoservicesFilterBar type={type ?? null} status={status ?? null} />
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes para los filtros seleccionados.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead>Cambiar estatus</TableHead>
              <TableHead>Asignado a</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.createdAtLabel}</TableCell>
                <TableCell>{r.typeLabel}</TableCell>
                <TableCell>{r.requesterName}</TableCell>
                <TableCell className="max-w-xs truncate">{r.detalle}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "completado" ? "default" : r.status === "cancelado" ? "secondary" : "outline"}>
                    {r.statusLabel}
                  </Badge>
                </TableCell>
                <TableCell>
                  <AssignedRequestStatusSelect requestId={r.id} status={r.status} requestType={r.requestType} allStatuses />
                </TableCell>
                <TableCell>
                  <AssignRequestSelect requestId={r.id} assignedAppUserId={r.assignedAppUserId} users={users} />
                </TableCell>
                <TableCell>
                  <GoservicesRequestDetailDialog request={r} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
