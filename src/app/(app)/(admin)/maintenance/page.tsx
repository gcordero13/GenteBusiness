import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Wrench } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewMaintenanceDialog } from "./NewMaintenanceDialog";
import { DeleteMaintenanceRecordButton } from "./DeleteMaintenanceRecordButton";

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  completado: "Completado",
  expirado: "Expirado",
};

export default async function MaintenancePage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  const { data: records } = await supabase
    .from("maintenance_records")
    .select("id, first_name, last_name, company_name, status, created_at, app_users(full_name, email)")
    .order("created_at", { ascending: false });

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, companies(name)")
    .eq("status", "active")
    .order("first_name");

  const contactOptions = (contacts ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`,
    email: c.email ?? "",
    company: (c.companies as unknown as { name: string } | null)?.name ?? "",
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mantenimientos</h1>
          <p className="text-sm text-muted-foreground">
            Registros de mantenimiento preventivo por contacto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/maintenance/surveys" className="text-sm underline">
            Encuestas
          </Link>
          {flags.can_add && <NewMaintenanceDialog contacts={contactOptions} />}
        </div>
      </div>
      {(records ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Wrench className="size-8" />
          <p className="text-sm">No hay registros de mantenimiento todavía.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="py-3">Usuario</TableHead>
                <TableHead className="py-3">Empresa</TableHead>
                <TableHead className="py-3">Técnico</TableHead>
                <TableHead className="py-3">Estado</TableHead>
                <TableHead className="py-3">Creado</TableHead>
                <TableHead className="py-3 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(records ?? []).map((r) => {
                const technician = r.app_users as unknown as { full_name: string | null; email: string } | null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="py-3">
                      {r.first_name} {r.last_name}
                    </TableCell>
                    <TableCell className="py-3">{r.company_name ?? "-"}</TableCell>
                    <TableCell className="py-3">{technician?.full_name ?? technician?.email ?? "-"}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant={r.status === "completado" ? "default" : "secondary"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      {new Date(r.created_at).toLocaleDateString("es-MX")}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/maintenance/${r.id}`} className="text-sm underline">
                          Ver
                        </Link>
                        {flags.can_delete && (
                          <DeleteMaintenanceRecordButton recordId={r.id} status={r.status} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
