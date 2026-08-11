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
import { Clock } from "lucide-react";
import { formatScheduleLine, type ScheduleTemplate } from "@/lib/schedules";
import { ScheduleForm } from "./ScheduleForm";
import { DeleteIconButton } from "@/components/DeleteIconButton";
import { deleteScheduleTemplate } from "./actions";

export default async function SchedulesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "schedules",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const { data: schedules } = await supabase
    .from("schedule_templates")
    .select("id, name, tolerance_minutes, is_default, schedule_template_days(day_of_week, start_time, end_time)")
    .order("name");

  const rows = (schedules ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    tolerance_minutes: s.tolerance_minutes,
    is_default: s.is_default,
    days: (s.schedule_template_days ?? []).map((d) => ({
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Horarios</h1>
        <ScheduleForm />
      </div>
      <p className="text-sm text-muted-foreground">
        Crea horarios con nombre y asígnalos a departamentos (por defecto) o a contactos individuales
        (excepción).
      </p>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Clock className="size-8" />
          <p className="text-sm">No hay horarios todavía.</p>
          <p className="text-xs">Crea el primero con el botón &quot;Nuevo horario&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Tolerancia</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const scheduleForFormat: ScheduleTemplate = {
                id: s.id,
                name: s.name,
                tolerance_minutes: s.tolerance_minutes,
                days: s.days,
              };
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.is_default && (
                      <Badge variant="secondary" className="ml-2">
                        Por defecto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatScheduleLine(scheduleForFormat)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.tolerance_minutes} min</TableCell>
                  <TableCell>
                    <ScheduleForm initial={s} />
                  </TableCell>
                  <TableCell>
                    {!s.is_default && (
                      <DeleteIconButton
                        confirmMessage={`¿Eliminar el horario "${s.name}"? Los departamentos o contactos que lo usen pasarán a usar el horario por defecto.`}
                        action={deleteScheduleTemplate.bind(null, s.id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
