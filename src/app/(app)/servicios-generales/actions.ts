"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABELS, type MaintenanceCategoryKey } from "./categories";

interface ActionResult {
  error?: string;
}

async function callerIdentity(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
}

async function callerCanManage(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "servicios_generales" });
  return Boolean(data?.[0]?.can_manage);
}

export interface MaintenanceRecordRow {
  id: string;
  seriesId: string | null;
  category: MaintenanceCategoryKey;
  departmentId: string | null;
  departmentName: string | null;
  description: string;
  scheduledDate: string;
  status: "programado" | "completado" | "vencido" | "cancelado";
}

function toRecordRow(r: {
  id: string;
  series_id: string | null;
  category: string;
  department_id: string | null;
  departments: { name: string } | { name: string }[] | null;
  description: string;
  scheduled_date: string;
  status: string;
}): MaintenanceRecordRow {
  const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
  return {
    id: r.id,
    seriesId: r.series_id,
    category: r.category as MaintenanceCategoryKey,
    departmentId: r.department_id,
    departmentName: dept?.name ?? null,
    description: r.description,
    scheduledDate: r.scheduled_date,
    status: r.status as MaintenanceRecordRow["status"],
  };
}

const RECORD_SELECT = "id, series_id, category, department_id, departments(name), description, scheduled_date, status";

// Flips any overdue 'programado' record to 'vencido' before reading, lazily
// - same precedent as the existing IT maintenance module's 'expirado'
// status, which avoids needing a cron job just to keep statuses accurate.
async function markOverdueAsVencido(): Promise<void> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  await admin
    .from("general_maintenance_records")
    .update({ status: "vencido" })
    .eq("status", "programado")
    .lt("scheduled_date", today);
}

export async function listMaintenanceRecordsForMonth(year: number, month: number): Promise<MaintenanceRecordRow[]> {
  await markOverdueAsVencido();

  const supabase = await createClient();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const monthEnd = nextMonthDate.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("general_maintenance_records")
    .select(RECORD_SELECT)
    .gte("scheduled_date", monthStart)
    .lt("scheduled_date", monthEnd)
    .order("scheduled_date", { ascending: true });

  return (data ?? []).map(toRecordRow);
}

export async function listUpcomingMaintenanceRecords(limit = 8): Promise<MaintenanceRecordRow[]> {
  await markOverdueAsVencido();

  const supabase = await createClient();
  const { data } = await supabase
    .from("general_maintenance_records")
    .select(RECORD_SELECT)
    .in("status", ["programado", "vencido"])
    .order("scheduled_date", { ascending: true })
    .limit(limit);

  return (data ?? []).map(toRecordRow);
}

export interface CreateMaintenanceInput {
  category: MaintenanceCategoryKey;
  departmentId: string;
  description: string;
  scheduledDate: string;
  recurring?: { interval: number; unit: "dias" | "semanas" | "meses" };
}

export async function createMaintenanceRecord(input: CreateMaintenanceInput): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };
  const caller = await callerIdentity();
  if (!caller) return { error: "No autorizado" };
  if (!input.description.trim()) return { error: "La descripción es obligatoria" };
  if (!input.departmentId) return { error: "Selecciona un departamento" };
  if (!input.scheduledDate) return { error: "Selecciona una fecha" };

  const admin = createAdminClient();

  let seriesId: string | null = null;
  if (input.recurring) {
    if (input.recurring.interval <= 0) return { error: "La frecuencia debe ser mayor a 0" };
    const { data: series, error: seriesError } = await admin
      .from("general_maintenance_series")
      .insert({
        category: input.category,
        department_id: input.departmentId,
        description: input.description.trim(),
        frequency_interval: input.recurring.interval,
        frequency_unit: input.recurring.unit,
        created_by: caller.id,
      })
      .select("id")
      .single();
    if (seriesError || !series) return { error: seriesError?.message ?? "No se pudo crear la serie" };
    seriesId = series.id;
  }

  const { error } = await admin.from("general_maintenance_records").insert({
    series_id: seriesId,
    category: input.category,
    department_id: input.departmentId,
    description: input.description.trim(),
    scheduled_date: input.scheduledDate,
    created_by: caller.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales");
  return {};
}

function nextOccurrenceDate(fromIso: string, interval: number, unit: "dias" | "semanas" | "meses"): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (unit === "dias") date.setUTCDate(date.getUTCDate() + interval);
  else if (unit === "semanas") date.setUTCDate(date.getUTCDate() + interval * 7);
  else date.setUTCMonth(date.getUTCMonth() + interval);
  return date.toISOString().slice(0, 10);
}

export async function completeMaintenanceRecord(id: string): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };
  const caller = await callerIdentity();
  if (!caller) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: record } = await admin
    .from("general_maintenance_records")
    .select("id, series_id, category, department_id, description, scheduled_date, status")
    .eq("id", id)
    .maybeSingle();
  if (!record) return { error: "No encontrado" };
  if (record.status === "completado" || record.status === "cancelado") {
    return { error: "Este registro ya está cerrado" };
  }

  const { error } = await admin
    .from("general_maintenance_records")
    .update({ status: "completado", completed_at: new Date().toISOString(), completed_by: caller.id })
    .eq("id", id);
  if (error) return { error: error.message };

  if (record.series_id) {
    const { data: series } = await admin
      .from("general_maintenance_series")
      .select("id, is_active, frequency_interval, frequency_unit")
      .eq("id", record.series_id)
      .maybeSingle();
    if (series?.is_active) {
      const nextDate = nextOccurrenceDate(record.scheduled_date, series.frequency_interval, series.frequency_unit);
      await admin.from("general_maintenance_records").insert({
        series_id: series.id,
        category: record.category,
        department_id: record.department_id,
        description: record.description,
        scheduled_date: nextDate,
        created_by: caller.id,
      });
    }
  }

  revalidatePath("/servicios-generales");
  return {};
}

export async function cancelMaintenanceRecord(id: string): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("general_maintenance_records").update({ status: "cancelado" }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales");
  return {};
}

// Stops future occurrences without touching history - the series row stays,
// just marked inactive, so completing the current record no longer spawns
// the next one.
export async function cancelMaintenanceSeries(seriesId: string): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("general_maintenance_series").update({ is_active: false }).eq("id", seriesId);
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales");
  return {};
}

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

export async function exportServiciosGeneralesCsv(): Promise<ActionResult & { csv?: string }> {
  if (!(await callerCanManage())) return { error: "No autorizado" };

  await markOverdueAsVencido();
  const admin = createAdminClient();
  const { data } = await admin
    .from("general_maintenance_records")
    .select(RECORD_SELECT)
    .order("scheduled_date", { ascending: false });

  const rows = (data ?? []).map(toRecordRow);
  const lines = [toCsvRow(["fecha", "categoria", "departamento", "descripcion", "estado"])];
  for (const r of rows) {
    lines.push(
      toCsvRow([r.scheduledDate, r.category, r.departmentName ?? "", r.description, STATUS_LABELS[r.status] ?? r.status]),
    );
  }
  return { csv: lines.join("\r\n") };
}
