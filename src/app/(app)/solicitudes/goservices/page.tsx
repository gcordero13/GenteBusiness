import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listMyGoservicesRequests } from "./actions";
import { NewGoservicesRequestDialog } from "./NewGoservicesRequestDialog";
import { GoservicesRequestDetailDialog } from "./GoservicesRequestDetailDialog";
import { GoservicesStatusSummary } from "./GoservicesStatusSummary";

export default async function GoservicesRequestsPage() {
  const requests = await listMyGoservicesRequests();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mis solicitudes GoServices</h1>
        <NewGoservicesRequestDialog />
      </div>
      <GoservicesStatusSummary rows={requests} />
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
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
                <TableCell className="max-w-xs truncate">{r.detalle}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "completado" ? "default" : r.status === "cancelado" ? "secondary" : "outline"}>
                    {r.statusLabel}
                  </Badge>
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
