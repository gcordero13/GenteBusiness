"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABELS, VEHICLE_SERVICE_TYPE_LABELS, type MaintenanceCategoryKey, type VehicleServiceType } from "./categories";

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

// ---- Assets ----------------------------------------------------------

export interface MaintenanceAssetRow {
  id: string;
  category: MaintenanceCategoryKey;
  name: string;
  brand: string | null;
  spec: string | null;
  licensePlate: string | null;
  currentMileage: number | null;
  departmentId: string | null;
  departmentName: string | null;
  assignedAppUserId: string | null;
  assignedUserName: string | null;
  status: "activo" | "inactivo";
}

function toAssetRow(
  r: {
    id: string;
    category: string;
    name: string;
    brand: string | null;
    spec: string | null;
    license_plate: string | null;
    current_mileage: number | null;
    department_id: string | null;
    departments: { name: string } | { name: string }[] | null;
    assigned_app_user_id: string | null;
    status: string;
  },
  emailByUserId: Map<string, string>,
): MaintenanceAssetRow {
  const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
  return {
    id: r.id,
    category: r.category as MaintenanceCategoryKey,
    name: r.name,
    brand: r.brand,
    spec: r.spec,
    licensePlate: r.license_plate,
    currentMileage: r.current_mileage,
    departmentId: r.department_id,
    departmentName: dept?.name ?? null,
    assignedAppUserId: r.assigned_app_user_id,
    assignedUserName: r.assigned_app_user_id ? (emailByUserId.get(r.assigned_app_user_id) ?? null) : null,
    status: r.status === "inactivo" ? "inactivo" : "activo",
  };
}

const ASSET_SELECT =
  "id, category, name, brand, spec, license_plate, current_mileage, department_id, departments(name), assigned_app_user_id, status";

// general_maintenance_assets has two FKs into app_users (assigned_app_user_id
// and created_by), which makes an embedded `app_users!assigned_app_user_id(email)`
// join ambiguous - same issue already hit in GoServices. A separate lookup
// sidesteps it entirely, and also resolves a real name via contacts
// (app_users.full_name is rarely populated - same precedent as GoServices'
// listAssignableUsers).
async function buildUserNameMap(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();

  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").in("id", ids);
  if (!users || users.length === 0) return new Map();

  const emails = users.map((u: { email: string }) => u.email);
  const { data: contacts } = await admin.from("contacts").select("email, first_name, last_name").in("email", emails);
  const nameByEmail = new Map((contacts ?? []).map((c) => [c.email, `${c.first_name} ${c.last_name}`]));

  return new Map(users.map((u: { id: string; email: string }) => [u.id, nameByEmail.get(u.email) ?? u.email]));
}

export interface AssignableAppUser {
  id: string;
  name: string;
}

// Assigning an asset/record is open to any platform user, not restricted
// to the Servicios Generales team - confirmed with the user ("a cualquier
// usuario de la plataforma").
export async function listAssignableAppUsers(): Promise<AssignableAppUser[]> {
  if (!(await callerCanManage())) return [];

  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").eq("status", "active").order("email");
  if (!users || users.length === 0) return [];

  const emailByIdMap = await buildUserNameMap(users.map((u: { id: string }) => u.id));
  return users.map((u: { id: string }) => ({ id: u.id, name: emailByIdMap.get(u.id) ?? u.id }));
}

export async function listMaintenanceAssets(options: { activeOnly?: boolean } = {}): Promise<MaintenanceAssetRow[]> {
  const supabase = await createClient();
  let query = supabase.from("general_maintenance_assets").select(ASSET_SELECT).order("name");
  if (options.activeOnly) query = query.eq("status", "activo");
  const { data } = await query;
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap(rows.map((r) => r.assigned_app_user_id));
  return rows.map((r) => toAssetRow(r, nameByUserId));
}

export interface MaintenanceAssetInput {
  category: MaintenanceCategoryKey;
  name: string;
  brand: string;
  spec: string;
  licensePlate: string;
  currentMileage: number | null;
  departmentId: string;
  assignedAppUserId: string;
}

export async function createMaintenanceAsset(input: MaintenanceAssetInput): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };
  const caller = await callerIdentity();
  if (!caller) return { error: "No autorizado" };
  if (!input.name.trim()) return { error: "El nombre es obligatorio" };

  const admin = createAdminClient();
  const { error } = await admin.from("general_maintenance_assets").insert({
    category: input.category,
    name: input.name.trim(),
    brand: input.brand.trim() || null,
    spec: input.spec.trim() || null,
    license_plate: input.licensePlate.trim() || null,
    current_mileage: input.currentMileage,
    department_id: input.departmentId || null,
    assigned_app_user_id: input.assignedAppUserId || null,
    created_by: caller.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales/activos");
  return {};
}

export async function updateMaintenanceAsset(id: string, input: MaintenanceAssetInput): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };
  if (!input.name.trim()) return { error: "El nombre es obligatorio" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("general_maintenance_assets")
    .update({
      category: input.category,
      name: input.name.trim(),
      brand: input.brand.trim() || null,
      spec: input.spec.trim() || null,
      license_plate: input.licensePlate.trim() || null,
      current_mileage: input.currentMileage,
      department_id: input.departmentId || null,
      assigned_app_user_id: input.assignedAppUserId || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales/activos");
  return {};
}

export async function setMaintenanceAssetStatus(id: string, status: "activo" | "inactivo"): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("general_maintenance_assets").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales/activos");
  return {};
}

// ---- Vendors -------------------------------------------------------------

export interface MaintenanceVendorRow {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  status: "activo" | "inactivo";
}

function toVendorRow(r: { id: string; name: string; phone: string | null; notes: string | null; status: string }): MaintenanceVendorRow {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    notes: r.notes,
    status: r.status === "inactivo" ? "inactivo" : "activo",
  };
}

export async function listMaintenanceVendors(options: { activeOnly?: boolean } = {}): Promise<MaintenanceVendorRow[]> {
  const supabase = await createClient();
  let query = supabase.from("general_maintenance_vendors").select("id, name, phone, notes, status").order("name");
  if (options.activeOnly) query = query.eq("status", "activo");
  const { data } = await query;
  return (data ?? []).map(toVendorRow);
}

export interface MaintenanceVendorInput {
  name: string;
  phone: string;
  notes: string;
}

export async function createMaintenanceVendor(input: MaintenanceVendorInput): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };
  const caller = await callerIdentity();
  if (!caller) return { error: "No autorizado" };
  if (!input.name.trim()) return { error: "El nombre es obligatorio" };

  const admin = createAdminClient();
  const { error } = await admin.from("general_maintenance_vendors").insert({
    name: input.name.trim(),
    phone: input.phone.trim() || null,
    notes: input.notes.trim() || null,
    created_by: caller.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales/proveedores");
  return {};
}

export async function updateMaintenanceVendor(id: string, input: MaintenanceVendorInput): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };
  if (!input.name.trim()) return { error: "El nombre es obligatorio" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("general_maintenance_vendors")
    .update({ name: input.name.trim(), phone: input.phone.trim() || null, notes: input.notes.trim() || null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales/proveedores");
  return {};
}

export async function setMaintenanceVendorStatus(id: string, status: "activo" | "inactivo"): Promise<ActionResult> {
  if (!(await callerCanManage())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("general_maintenance_vendors").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/servicios-generales/proveedores");
  return {};
}

// ---- Records -----------------------------------------------------------

export interface MaintenanceRecordRow {
  id: string;
  seriesId: string | null;
  category: MaintenanceCategoryKey;
  departmentId: string | null;
  departmentName: string | null;
  description: string;
  scheduledDate: string;
  scheduledTime: string | null;
  status: "programado" | "completado" | "vencido" | "cancelado";
  assetId: string | null;
  assetName: string | null;
  vehicleServiceType: VehicleServiceType | null;
  mileageAtService: number | null;
  nextDueMileage: number | null;
  nextDueDate: string | null;
  cost: number | null;
  vendorId: string | null;
  vendorName: string | null;
}

function toRecordRow(r: {
  id: string;
  series_id: string | null;
  category: string;
  department_id: string | null;
  departments: { name: string } | { name: string }[] | null;
  description: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  asset_id: string | null;
  general_maintenance_assets: { name: string } | { name: string }[] | null;
  vehicle_service_type: string | null;
  mileage_at_service: number | null;
  next_due_mileage: number | null;
  next_due_date: string | null;
  cost: number | null;
  vendor_id: string | null;
  general_maintenance_vendors: { name: string } | { name: string }[] | null;
}): MaintenanceRecordRow {
  const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
  const asset = Array.isArray(r.general_maintenance_assets) ? r.general_maintenance_assets[0] : r.general_maintenance_assets;
  const vendor = Array.isArray(r.general_maintenance_vendors) ? r.general_maintenance_vendors[0] : r.general_maintenance_vendors;
  return {
    id: r.id,
    seriesId: r.series_id,
    category: r.category as MaintenanceCategoryKey,
    departmentId: r.department_id,
    departmentName: dept?.name ?? null,
    description: r.description,
    scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time,
    status: r.status as MaintenanceRecordRow["status"],
    assetId: r.asset_id,
    assetName: asset?.name ?? null,
    vehicleServiceType: r.vehicle_service_type as VehicleServiceType | null,
    mileageAtService: r.mileage_at_service,
    nextDueMileage: r.next_due_mileage,
    nextDueDate: r.next_due_date,
    cost: r.cost,
    vendorId: r.vendor_id,
    vendorName: vendor?.name ?? null,
  };
}

const RECORD_SELECT =
  "id, series_id, category, department_id, departments(name), description, scheduled_date, scheduled_time, status, asset_id, general_maintenance_assets(name), vehicle_service_type, mileage_at_service, next_due_mileage, next_due_date, cost, vendor_id, general_maintenance_vendors(name)";

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

export async function listMaintenanceRecordsForAsset(assetId: string): Promise<MaintenanceRecordRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("general_maintenance_records")
    .select(RECORD_SELECT)
    .eq("asset_id", assetId)
    .order("scheduled_date", { ascending: false });

  return (data ?? []).map(toRecordRow);
}

export interface CreateMaintenanceInput {
  category: MaintenanceCategoryKey;
  departmentId: string;
  description: string;
  scheduledDate: string;
  scheduledTime?: string;
  recurring?: { interval: number; unit: "dias" | "semanas" | "meses" };
  assetId?: string;
  vehicleServiceType?: VehicleServiceType;
  mileageAtService?: number;
  nextDueMileage?: number;
  nextDueDate?: string;
  cost?: number;
  vendorId?: string;
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
    scheduled_time: input.scheduledTime || null,
    created_by: caller.id,
    asset_id: input.assetId || null,
    vehicle_service_type: input.vehicleServiceType ?? null,
    mileage_at_service: input.mileageAtService ?? null,
    next_due_mileage: input.nextDueMileage ?? null,
    next_due_date: input.nextDueDate || null,
    cost: input.cost ?? null,
    vendor_id: input.vendorId || null,
  });
  if (error) return { error: error.message };

  if (input.assetId && input.mileageAtService) {
    await bumpAssetMileage(input.assetId, input.mileageAtService);
  }

  revalidatePath("/servicios-generales");
  return {};
}

async function bumpAssetMileage(assetId: string, mileage: number): Promise<void> {
  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("general_maintenance_assets")
    .select("current_mileage")
    .eq("id", assetId)
    .maybeSingle();
  if (asset && (asset.current_mileage ?? 0) < mileage) {
    await admin.from("general_maintenance_assets").update({ current_mileage: mileage }).eq("id", assetId);
  }
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
  const lines = [
    toCsvRow([
      "fecha",
      "hora",
      "categoria",
      "activo",
      "departamento",
      "descripcion",
      "tipo_de_chequeo",
      "kilometraje",
      "proximo_cambio",
      "monto",
      "proveedor",
      "estado",
    ]),
  ];
  for (const r of rows) {
    lines.push(
      toCsvRow([
        r.scheduledDate,
        r.scheduledTime ?? "",
        r.category,
        r.assetName ?? "",
        r.departmentName ?? "",
        r.description,
        r.vehicleServiceType ? VEHICLE_SERVICE_TYPE_LABELS[r.vehicleServiceType] : "",
        r.mileageAtService?.toString() ?? "",
        r.nextDueMileage != null ? `${r.nextDueMileage} mi` : (r.nextDueDate ?? ""),
        r.cost?.toString() ?? "",
        r.vendorName ?? "",
        STATUS_LABELS[r.status] ?? r.status,
      ]),
    );
  }
  return { csv: lines.join("\r\n") };
}
