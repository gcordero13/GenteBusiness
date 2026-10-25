"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerFlags } from "../actions";

interface ActionResult {
  error?: string;
}

export interface PositionObjectiveInput {
  title: string;
  kpiMetric: string;
  suggestedTarget: number | null;
  unit: string;
}

export interface PositionRow {
  id: string;
  name: string;
  status: "activo" | "inactivo";
  objectives: (PositionObjectiveInput & { id: string })[];
}

export async function listPositions(): Promise<PositionRow[]> {
  const admin = createAdminClient();
  const { data: positions } = await admin.from("poa_positions").select("id, name, status").order("name");
  const rows = positions ?? [];
  const ids = rows.map((p) => p.id);
  const { data: objectives } = ids.length
    ? await admin
        .from("poa_position_objectives")
        .select("id, position_id, title, kpi_metric, suggested_target, unit, sort_order")
        .in("position_id", ids)
        .order("sort_order")
    : { data: [] as { id: string; position_id: string; title: string; kpi_metric: string; suggested_target: number | null; unit: string | null }[] };

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status as "activo" | "inactivo",
    objectives: (objectives ?? [])
      .filter((o) => o.position_id === p.id)
      .map((o) => ({
        id: o.id,
        title: o.title,
        kpiMetric: o.kpi_metric,
        suggestedTarget: o.suggested_target,
        unit: o.unit ?? "",
      })),
  }));
}

export async function createPosition(name: string, objectives: PositionObjectiveInput[]): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };
  if (!name.trim()) return { error: "El nombre es obligatorio" };
  if (objectives.length === 0) return { error: "Agrega al menos un objetivo/KPI" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: position, error } = await admin
    .from("poa_positions")
    .insert({ name: name.trim(), created_by: user.id })
    .select("id")
    .single();
  if (error || !position) return { error: error?.message ?? "No se pudo crear el puesto" };

  const { error: objError } = await admin.from("poa_position_objectives").insert(
    objectives.map((o, i) => ({
      position_id: position.id,
      title: o.title,
      kpi_metric: o.kpiMetric,
      suggested_target: o.suggestedTarget,
      unit: o.unit || null,
      sort_order: i,
    })),
  );
  if (objError) return { error: objError.message };

  revalidatePath("/planificacion/puestos");
  return {};
}

export async function setPositionStatus(id: string, status: "activo" | "inactivo"): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("poa_positions").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/planificacion/puestos");
  return {};
}
