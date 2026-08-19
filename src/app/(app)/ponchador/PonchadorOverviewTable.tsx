import { Fragment } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PonchadorGridCellStatus = "vacaciones" | "permiso" | "ausente" | "weekend" | "normal";

export interface PonchadorGridDayCell {
  dayNumber: number;
  arrivalLabel: string | null;
  exitLabel: string | null;
  status: PonchadorGridCellStatus;
}

export interface PonchadorGridPersonRow {
  contactId: string;
  name: string;
  puntualidadLabel: string;
  href: string;
  days: PonchadorGridDayCell[];
}

const CELL_STATUS_CLASSNAMES: Record<PonchadorGridCellStatus, string> = {
  vacaciones: "bg-blue-100",
  permiso: "bg-orange-100",
  ausente: "bg-red-100",
  weekend: "bg-muted/40",
  normal: "",
};

export function PonchadorOverviewTable({ rows }: { rows: PonchadorGridPersonRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay personas para mostrar en este período.</p>;
  }

  const dayNumbers = rows[0].days.map((d) => d.dayNumber);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">Nombre</TableHead>
            <TableHead>E/S</TableHead>
            {dayNumbers.map((day) => (
              <TableHead key={day} className="text-center">
                {day}
              </TableHead>
            ))}
            <TableHead>%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.contactId}>
              <TableRow>
                <TableCell rowSpan={2} className="sticky left-0 bg-background align-top font-medium">
                  <Link href={row.href} className="text-[#04B1AF] hover:underline">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">E</TableCell>
                {row.days.map((day) => (
                  <TableCell
                    key={day.dayNumber}
                    className={`text-center text-xs ${CELL_STATUS_CLASSNAMES[day.status]}`}
                  >
                    {day.arrivalLabel ?? "—"}
                  </TableCell>
                ))}
                <TableCell rowSpan={2} className="align-middle font-medium">
                  {row.puntualidadLabel}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs text-muted-foreground">S</TableCell>
                {row.days.map((day) => (
                  <TableCell
                    key={day.dayNumber}
                    className={`text-center text-xs ${CELL_STATUS_CLASSNAMES[day.status]}`}
                  >
                    {day.exitLabel ?? "—"}
                  </TableCell>
                ))}
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
