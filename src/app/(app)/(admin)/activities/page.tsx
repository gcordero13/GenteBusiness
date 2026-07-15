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
import { PartyPopper } from "lucide-react";
import { formatMonthDay } from "@/lib/contacts";
import { ActivityForm } from "./ActivityForm";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: events } = await supabase
    .from("company_events")
    .select("*")
    .order("event_date");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Actividades y días de fiesta</h1>
        <ActivityForm />
      </div>
      {(events ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <PartyPopper className="size-8" />
          <p className="text-sm">No hay actividades todavía.</p>
          <p className="text-xs">Crea la primera con el botón &quot;Nueva actividad&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(events ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.name}</TableCell>
                <TableCell>{formatMonthDay(e.event_date)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
