"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerFlags } from "../actions";

interface ActionResult {
  error?: string;
}

export interface SupervisedContactRow {
  contactId: string;
  name: string;
  departmentId: string;
  departmentName: string | null;
  positionId: string | null;
  positionName: string | null;
  hasPoaForYear: boolean;
}

async function mySupervisedDepartmentIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("planificacion_department_leaders")
    .select("department_id")
    .eq("app_user_id", user.id);
  return (data ?? []).map((r) => r.department_id);
}

export async function listSupervisedContacts(periodYear: number): Promise<SupervisedContactRow[]> {
  const flags = await callerFlags();
  if (!flags.canManage && !flags.canAuthorize) return [];

  const admin = createAdminClient();
  let query = admin
    .from("contacts")
    .select("id, first_name, last_name, department_id, departments(name), poa_position_id, poa_positions(name)")
    .eq("status", "active")
    .order("first_name");

  if (!flags.canAuthorize) {
    const departmentIds = await mySupervisedDepartmentIds();
    if (departmentIds.length === 0) return [];
    query = query.in("department_id", departmentIds);
  }

  const { data: contacts } = await query;
  const rows = contacts ?? [];
  const contactIds = rows.map((c) => c.id);
  const { data: existingPoas } = contactIds.length
    ? await admin.from("poas").select("contact_id").eq("period_year", periodYear).in("contact_id", contactIds)
    : { data: [] as { contact_id: string }[] };
  const withPoa = new Set((existingPoas ?? []).map((p) => p.contact_id));

  return rows.map((c) => {
    const dept = Array.isArray(c.departments) ? c.departments[0] : c.departments;
    const position = Array.isArray(c.poa_positions) ? c.poa_positions[0] : c.poa_positions;
    return {
      contactId: c.id,
      name: `${c.first_name} ${c.last_name}`,
      departmentId: c.department_id,
      departmentName: dept?.name ?? null,
      positionId: c.poa_position_id,
      positionName: position?.name ?? null,
      hasPoaForYear: withPoa.has(c.id),
    };
  });
}

export interface PositionObjectiveOption {
  title: string;
  kpiMetric: string;
  targetValue: number;
  unit: string;
}

export async function getPositionTemplate(positionId: string): Promise<PositionObjectiveOption[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("poa_position_objectives")
    .select("title, kpi_metric, suggested_target, unit")
    .eq("position_id", positionId)
    .order("sort_order");
  return (data ?? []).map((o) => ({
    title: o.title,
    kpiMetric: o.kpi_metric,
    targetValue: o.suggested_target ?? 0,
    unit: o.unit ?? "",
  }));
}

export interface ListPositionsOption {
  id: string;
  name: string;
}

export async function listActivePositionOptions(): Promise<ListPositionsOption[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("poa_positions").select("id, name").eq("status", "activo").order("name");
  return data ?? [];
}

export interface AssignPoaInput {
  contactId: string;
  positionId: string | null;
  periodYear: number;
  objectives: { title: string; kpiMetric: string; targetValue: number; unit: string }[];
}

export async function assignPoa(input: AssignPoaInput): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canManage && !flags.canAuthorize) return { error: "No autorizado" };
  if (input.objectives.length === 0) return { error: "Agrega al menos un objetivo" };

  const admin = createAdminClient();
  const { data: contactRow } = await admin
    .from("contacts")
    .select("department_id")
    .eq("id", input.contactId)
    .maybeSingle();
  const departmentId = contactRow?.department_id;
  if (!departmentId) return { error: "No se encontró el departamento del contacto" };

  if (!flags.canAuthorize) {
    const departmentIds = await mySupervisedDepartmentIds();
    if (!departmentIds.includes(departmentId)) return { error: "No autorizado para este departamento" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: poa, error } = await admin
    .from("poas")
    .insert({
      contact_id: input.contactId,
      department_id: departmentId,
      position_id: input.positionId,
      period_year: input.periodYear,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !poa) return { error: error?.message ?? "No se pudo crear el POA" };

  const { error: objError } = await admin.from("poa_objectives").insert(
    input.objectives.map((o, i) => ({
      poa_id: poa.id,
      title: o.title,
      kpi_metric: o.kpiMetric,
      target_value: o.targetValue,
      unit: o.unit || null,
      sort_order: i,
    })),
  );
  if (objError) return { error: objError.message };

  revalidatePath("/planificacion/equipo");
  return {};
}
