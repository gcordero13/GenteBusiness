import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeAverageSatisfactionByTechnician } from "@/lib/maintenanceSurveys";

export default async function MaintenanceSurveysPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const { data: surveys } = await supabase
    .from("maintenance_surveys")
    .select(
      "id, status, quality_score, professionalism_score, clarity_score, satisfaction_score, comments, responded_at, maintenance_record_id, app_users(id, full_name, email), maintenance_records(first_name, last_name)",
    )
    .order("responded_at", { ascending: false, nullsFirst: false });

  const answered = (surveys ?? []).filter((s) => s.status === "respondida");
  const averages = computeAverageSatisfactionByTechnician(
    answered.map((s) => {
      const tech = s.app_users as unknown as { id: string; full_name: string | null; email: string } | null;
      return {
        technician_id: tech?.id ?? "desconocido",
        technician_name: tech?.full_name ?? tech?.email ?? "Desconocido",
        satisfaction_score: s.satisfaction_score,
      };
    }),
  );

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Encuestas de satisfacción</h1>
        <Link href="/maintenance" className="text-sm underline">
          Volver a Mantenimientos
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Promedio de satisfacción por técnico</h2>
        {averages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay respuestas.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="py-3">Técnico</TableHead>
                  <TableHead className="py-3">Promedio</TableHead>
                  <TableHead className="py-3">Respuestas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {averages.map((a) => (
                  <TableRow key={a.technician_id}>
                    <TableCell className="py-3">{a.technician_name}</TableCell>
                    <TableCell className="py-3">{a.average}</TableCell>
                    <TableCell className="py-3">{a.responses}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Respuestas individuales</h2>
        {answered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay respuestas.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="py-3">Usuario</TableHead>
                  <TableHead className="py-3">Calidad</TableHead>
                  <TableHead className="py-3">Profesionalismo</TableHead>
                  <TableHead className="py-3">Claridad</TableHead>
                  <TableHead className="py-3">Satisfacción</TableHead>
                  <TableHead className="py-3">Comentarios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {answered.map((s) => {
                  const record = s.maintenance_records as unknown as { first_name: string; last_name: string } | null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="py-3">
                        {record ? `${record.first_name} ${record.last_name}` : "-"}
                      </TableCell>
                      <TableCell className="py-3">{s.quality_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.professionalism_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.clarity_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.satisfaction_score ?? "-"}</TableCell>
                      <TableCell className="py-3">{s.comments ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
