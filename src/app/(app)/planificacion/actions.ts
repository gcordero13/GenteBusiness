"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ActionResult {
  error?: string;
}

export interface CallerFlags {
  canView: boolean;
  canManage: boolean;
  canAuthorize: boolean;
}

export async function callerFlags(): Promise<CallerFlags> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  return {
    canView: Boolean(data?.[0]?.can_view),
    canManage: Boolean(data?.[0]?.can_manage),
    canAuthorize: Boolean(data?.[0]?.can_authorize),
  };
}

export interface MyContactInfo {
  contactId: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  positionId: string | null;
}

export async function getMyContact(): Promise<MyContactInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name, department_id, departments(name), poa_position_id")
    .eq("email", user.email)
    .maybeSingle();
  if (!contact) return null;

  const dept = Array.isArray(contact.departments) ? contact.departments[0] : contact.departments;
  return {
    contactId: contact.id,
    name: `${contact.first_name} ${contact.last_name}`,
    departmentId: contact.department_id,
    departmentName: dept?.name ?? null,
    positionId: contact.poa_position_id,
  };
}

export interface PoaObjectiveUpdateRow {
  id: string;
  value: number;
  recordedAt: string;
  note: string | null;
}

export interface PoaObjectiveRow {
  id: string;
  title: string;
  kpiMetric: string;
  targetValue: number;
  unit: string | null;
  notes: string | null;
  updates: PoaObjectiveUpdateRow[];
}

export interface PoaRow {
  id: string;
  contactId: string;
  contactName: string;
  departmentId: string;
  departmentName: string | null;
  positionId: string | null;
  positionName: string | null;
  periodYear: number;
  status: "activo" | "cerrado";
  objectives: PoaObjectiveRow[];
}

// Shared by "Mi POA" (own contact) and "Mi equipo" (drilling into someone
// else's POA) - exported so equipo/actions.ts and equipo/page.tsx can
// reuse it instead of duplicating the join/shape logic.
export async function getPoaForContact(contactId: string, periodYear: number): Promise<PoaRow | null> {
  const admin = createAdminClient();
  const { data: poa } = await admin
    .from("poas")
    .select(
      "id, contact_id, department_id, departments(name), position_id, poa_positions(name), period_year, status, contacts(first_name, last_name)",
    )
    .eq("contact_id", contactId)
    .eq("period_year", periodYear)
    .maybeSingle();
  if (!poa) return null;

  const { data: objectives } = await admin
    .from("poa_objectives")
    .select("id, title, kpi_metric, target_value, unit, notes, sort_order")
    .eq("poa_id", poa.id)
    .order("sort_order");

  const objectiveIds = (objectives ?? []).map((o) => o.id);
  const { data: updates } = objectiveIds.length
    ? await admin
        .from("poa_objective_updates")
        .select("id, objective_id, value, recorded_at, note")
        .in("objective_id", objectiveIds)
        .order("recorded_at", { ascending: true })
    : { data: [] as { id: string; objective_id: string; value: number; recorded_at: string; note: string | null }[] };

  const dept = Array.isArray(poa.departments) ? poa.departments[0] : poa.departments;
  const position = Array.isArray(poa.poa_positions) ? poa.poa_positions[0] : poa.poa_positions;
  const contact = Array.isArray(poa.contacts) ? poa.contacts[0] : poa.contacts;

  return {
    id: poa.id,
    contactId: poa.contact_id,
    contactName: contact ? `${contact.first_name} ${contact.last_name}` : "",
    departmentId: poa.department_id,
    departmentName: dept?.name ?? null,
    positionId: poa.position_id,
    positionName: position?.name ?? null,
    periodYear: poa.period_year,
    status: poa.status as "activo" | "cerrado",
    objectives: (objectives ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      kpiMetric: o.kpi_metric,
      targetValue: o.target_value,
      unit: o.unit,
      notes: o.notes,
      updates: (updates ?? [])
        .filter((u) => u.objective_id === o.id)
        .map((u) => ({ id: u.id, value: u.value, recordedAt: u.recorded_at, note: u.note })),
    })),
  };
}

export async function getMyPoa(periodYear: number): Promise<PoaRow | null> {
  const me = await getMyContact();
  if (!me) return null;
  return getPoaForContact(me.contactId, periodYear);
}

export async function logObjectiveUpdate(objectiveId: string, value: number, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (Number.isNaN(value)) return { error: "El valor debe ser un número" };

  const { error } = await supabase.from("poa_objective_updates").insert({
    objective_id: objectiveId,
    value,
    recorded_by: user.id,
    note: note.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/planificacion/poas");
  revalidatePath("/planificacion/equipo");
  return {};
}

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

export async function exportPlanificacionCsv(periodYear: number): Promise<ActionResult & { csv?: string }> {
  const flags = await callerFlags();
  if (!flags.canManage && !flags.canAuthorize) return { error: "No autorizado" };

  const admin = createAdminClient();
  let query = admin
    .from("poas")
    .select(
      "id, contact_id, contacts(first_name, last_name), department_id, departments(name), poa_objectives(title, kpi_metric, target_value, unit, poa_objective_updates(value, recorded_at))",
    )
    .eq("period_year", periodYear);

  if (!flags.canAuthorize) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: deptRows } = await admin
      .from("planificacion_department_leaders")
      .select("department_id")
      .eq("app_user_id", user?.id ?? "");
    const departmentIds = (deptRows ?? []).map((r) => r.department_id);
    if (departmentIds.length === 0) return { csv: toCsvRow(["persona", "departamento", "objetivo", "metrica", "meta", "ultimo_valor", "fecha"]) };
    query = query.in("department_id", departmentIds);
  }

  const { data: poas } = await query;
  const lines = [toCsvRow(["persona", "departamento", "objetivo", "metrica", "meta", "ultimo_valor", "fecha"])];

  for (const poa of poas ?? []) {
    const contact = Array.isArray(poa.contacts) ? poa.contacts[0] : poa.contacts;
    const dept = Array.isArray(poa.departments) ? poa.departments[0] : poa.departments;
    const personName = contact ? `${contact.first_name} ${contact.last_name}` : "";
    for (const objective of poa.poa_objectives ?? []) {
      const updates = objective.poa_objective_updates ?? [];
      const latest = updates.length > 0 ? updates[updates.length - 1] : null;
      lines.push(
        toCsvRow([
          personName,
          dept?.name ?? "",
          objective.title,
          objective.kpi_metric,
          `${objective.target_value}${objective.unit ? ` ${objective.unit}` : ""}`,
          latest ? String(latest.value) : "",
          latest ? latest.recorded_at : "",
        ]),
      );
    }
  }

  return { csv: lines.join("\r\n") };
}
