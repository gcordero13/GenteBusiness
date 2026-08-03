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
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { VacationRequestActions } from "./VacationRequestActions";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

export default async function VacationRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "solicitudes_vacaciones",
  });
  const canAuthorize = flagsRows?.[0]?.can_authorize ?? false;

  const { data: requests } = await supabase
    .from("vacation_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: signatureRows } = await supabase
    .from("user_signatures")
    .select("id, storage_path")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const signatures: SignatureWithUrl[] = await Promise.all(
    (signatureRows ?? []).map(async (s) => {
      const { data, error } = await supabase.storage.from("user-signatures").createSignedUrl(s.storage_path, 14400);
      if (error) console.error(`Failed to sign URL for signature ${s.id} (${s.storage_path}):`, error.message);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes de vacaciones</h1>
        <NewVacationRequestDialog />
      </div>
      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(requests ?? []).map((r) => {
              const isPendingSupervisorForMe = r.status === "pendiente_supervisor" && r.supervisor_app_user_id === user!.id;
              // Also gated on can_authorize (via get_my_module_permissions above) so the
              // button isn't rendered at all for a can_view-only viewer — RLS and
              // respondAsRrhh's own server-side can_authorize check already make clicking
              // safe either way, but hiding it here closes the UX gap for that viewer.
              const isPendingRrhhForMe = r.status === "pendiente_rrhh" && canAuthorize;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.first_name} {r.last_name}
                  </TableCell>
                  <TableCell>{r.period ?? "-"}</TableCell>
                  <TableCell>
                    {r.date_from} → {r.date_to}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "aprobado" ? "default" : r.status === "rechazado" ? "secondary" : "outline"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isPendingSupervisorForMe && (
                      <VacationRequestActions requestId={r.id} role="supervisor" signatures={signatures} />
                    )}
                    {isPendingRrhhForMe && (
                      <VacationRequestActions requestId={r.id} role="rrhh" signatures={signatures} />
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
