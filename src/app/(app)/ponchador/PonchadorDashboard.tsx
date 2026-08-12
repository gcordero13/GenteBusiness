import { CalendarClock, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PonchadorRow {
  dateIso: string;
  dateLabel: string;
  arrivalLabel: string | null;
  exitLabel: string | null;
}

export function PonchadorDashboard({
  averageArrivalLabel,
  rows,
}: {
  averageArrivalLabel: string | null;
  rows: PonchadorRow[];
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <TrendingUp className="size-4 text-[#04B1AF]" />
          Promedio de llegada este mes
        </div>
        <p className="mt-2 text-2xl font-bold">{averageArrivalLabel ?? "Sin datos este mes"}</p>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4 text-muted-foreground" />
          Registro del mes
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay ponchadas registradas este mes.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.dateIso}>
                  <TableCell>{row.dateLabel}</TableCell>
                  <TableCell>{row.arrivalLabel ?? "—"}</TableCell>
                  <TableCell>{row.exitLabel ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
