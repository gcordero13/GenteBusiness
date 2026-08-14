import Link from "next/link";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PonchadorOverviewRow {
  contactId: string;
  name: string;
  departmentName?: string | null;
  averageArrivalLabel: string | null;
  diasTrabajadosLabel: string;
  puntualidadLabel: string;
  horasTrabajadasLabel: string;
  href: string;
}

export function PonchadorOverviewTable({
  rows,
  groupByDepartment,
}: {
  rows: PonchadorOverviewRow[];
  groupByDepartment: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay personas para mostrar en este período.</p>;
  }

  if (!groupByDepartment) {
    return <OverviewTableBody rows={rows} />;
  }

  const groups = new Map<string, PonchadorOverviewRow[]>();
  for (const row of rows) {
    const key = row.departmentName ?? "Sin departamento";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([department, members]) => (
          <div key={department}>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">{department}</p>
            <OverviewTableBody rows={members} caption={department} />
          </div>
        ))}
    </div>
  );
}

function OverviewTableBody({ rows, caption }: { rows: PonchadorOverviewRow[]; caption?: string }) {
  return (
    <Table>
      {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Promedio de entrada</TableHead>
          <TableHead>Días trabajados</TableHead>
          <TableHead>Puntualidad</TableHead>
          <TableHead>Horas trabajadas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.contactId}>
            <TableCell>
              <Link href={row.href} className="font-medium text-[#04B1AF] hover:underline">
                {row.name}
              </Link>
            </TableCell>
            <TableCell>{row.averageArrivalLabel ?? "Sin datos"}</TableCell>
            <TableCell>{row.diasTrabajadosLabel}</TableCell>
            <TableCell>{row.puntualidadLabel}</TableCell>
            <TableCell>{row.horasTrabajadasLabel}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
