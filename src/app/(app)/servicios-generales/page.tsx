import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMaintenanceRecordsForMonth, listUpcomingMaintenanceRecords } from "./actions";
import { MAINTENANCE_CATEGORIES } from "./categories";
import { MaintenanceCalendar } from "./MaintenanceCalendar";
import { CreateMaintenanceDialog } from "./CreateMaintenanceDialog";
import { UpcomingMaintenanceList } from "./UpcomingList";
import { ExportReportButton } from "./ExportButton";

export default async function ServiciosGeneralesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const today = new Date();
  const year = Number(params.year) || today.getFullYear();
  const month = Number(params.month) || today.getMonth() + 1;

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "servicios_generales" });
  const canManage = Boolean(flagsRows?.[0]?.can_manage);
  const canView = Boolean(flagsRows?.[0]?.can_view);
  if (!canView && !canManage) {
    redirect("/");
  }

  const [records, upcoming, { data: departments }] = await Promise.all([
    listMaintenanceRecordsForMonth(year, month),
    listUpcomingMaintenanceRecords(),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Servicios Generales</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona y da seguimiento a todos los mantenimientos de la empresa en un solo lugar.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <ExportReportButton />
              <CreateMaintenanceDialog departments={departments ?? []} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MAINTENANCE_CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-white ${c.dotClass}`}>
                <c.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.example}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <MaintenanceCalendar year={year} month={month} records={records} />
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Tipos de mantenimiento</h3>
            <div className="space-y-1.5">
              {MAINTENANCE_CATEGORIES.map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-sm">
                  <span className={`size-2 rounded-full ${c.dotClass}`} />
                  <span className="text-foreground">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Próximos mantenimientos</h3>
          <UpcomingMaintenanceList records={upcoming} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
