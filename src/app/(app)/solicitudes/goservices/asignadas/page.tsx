import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAssignedGoservicesRequests } from "../actions";
import { AssignedRequestStatusSelect } from "./AssignedRequestStatusSelect";
import { GoservicesRequestDetailDialog } from "../GoservicesRequestDetailDialog";
import { GoservicesStatusSummary } from "../GoservicesStatusSummary";

export default async function GoservicesAssignedPage() {
  const requests = await listAssignedGoservicesRequests();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Mis tareas asignadas</h1>
      <GoservicesStatusSummary rows={requests} />
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes tareas asignadas por el momento.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Estatus</TableHead>
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
                  <AssignedRequestStatusSelect requestId={r.id} status={r.status} requestType={r.requestType} />
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
