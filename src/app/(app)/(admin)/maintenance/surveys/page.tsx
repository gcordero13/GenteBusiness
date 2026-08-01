import { redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeAverageSatisfactionByTechnician, computeQuestionAverages } from "@/lib/maintenanceSurveys";

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

  const all = surveys ?? [];
  const answered = all.filter((s) => s.status === "respondida");
  const responseRate = all.length > 0 ? Math.round((answered.length / all.length) * 100) : 0;

  const questionAverages = computeQuestionAverages(answered);
  const overallAverage =
    questionAverages.some((q) => q.responses > 0)
      ? Math.round(
          (questionAverages.reduce((sum, q) => sum + q.average, 0) / questionAverages.length) * 10,
        ) / 10
      : 0;

  const technicianAverages = computeAverageSatisfactionByTechnician(
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Encuestas de satisfacción</h1>
          <Link href="/maintenance" className="text-sm underline">
            Volver a Mantenimientos
          </Link>
        </div>
        <a
          href="/maintenance/surveys/export"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Download className="size-4" />
          Exportar CSV
        </a>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Respuestas</p>
          <p className="text-2xl font-semibold">
            {answered.length}
            <span className="text-base font-normal text-muted-foreground"> / {all.length}</span>
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Tasa de respuesta</p>
          <p className="text-2xl font-semibold">{responseRate}%</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Promedio general</p>
          <p className="text-2xl font-semibold">{answered.length > 0 ? overallAverage.toFixed(1) : "—"} / 5</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Promedio por pregunta</h2>
        {answered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay respuestas.</p>
        ) : (
          <div className="space-y-4 rounded-xl border p-4">
            {questionAverages.map((q) => (
              <div key={q.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{q.label}</span>
                  <span className="font-medium text-foreground">{q.responses > 0 ? q.average.toFixed(1) : "—"}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-[#04B1AF]"
                    style={{ width: `${Math.max((q.average / 5) * 100, q.responses > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Promedio de satisfacción por técnico</h2>
        {technicianAverages.length === 0 ? (
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
                {technicianAverages.map((a) => (
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
