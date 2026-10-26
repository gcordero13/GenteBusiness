"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface ActionResult {
  error?: string;
}

export interface ProyectoRow {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  archived: boolean;
}

export async function createProyecto(name: string, description: string): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!name.trim()) return { error: "El nombre es obligatorio" };

  const { data, error } = await supabase
    .from("plan_proyectos")
    .insert({ name: name.trim(), description: description.trim() || null, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear el proyecto" };

  revalidatePath("/planificacion");
  return { id: data.id };
}

export interface ProyectoListRow extends ProyectoRow {
  isOwner: boolean;
}

// RLS already restricts plan_proyectos to rows the caller owns or was
// shared into - these two functions just split that same visible set into
// "mine" vs "shared with me" for the two landing-screen sections.
export async function listMisProyectos(): Promise<ProyectoListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_proyectos")
    .select("id, name, description, created_by, archived")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdBy: p.created_by,
    archived: p.archived,
    isOwner: true,
  }));
}

export async function listCompartidoConmigo(): Promise<ProyectoListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_proyectos")
    .select("id, name, description, created_by, archived")
    .neq("created_by", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdBy: p.created_by,
    archived: p.archived,
    isOwner: false,
  }));
}

export async function getProyecto(id: string): Promise<ProyectoRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_proyectos")
    .select("id, name, description, created_by, archived")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name, description: data.description, createdBy: data.created_by, archived: data.archived };
}

export interface TareaListRow {
  id: string;
  proyectoId: string;
  proyectoName: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  estadoId: string | null;
  estadoName: string | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  cicloId: string | null;
  createdBy: string;
  moduloIds: string[];
  relationship: "mio" | "asignado" | "compartido";
}

interface RawTareaRow {
  id: string;
  proyecto_id: string;
  plan_proyectos: { name: string } | { name: string }[] | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  estado_id: string | null;
  plan_estados: { name: string } | { name: string }[] | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[] | null;
  start_date: string | null;
  due_date: string | null;
  assignee_id: string | null;
  ciclo_id: string | null;
  created_by: string;
  plan_tarea_modulos: { modulo_id: string }[] | null;
}

function toTareaListRow(t: RawTareaRow, callerId: string): TareaListRow {
  const proyecto = Array.isArray(t.plan_proyectos) ? t.plan_proyectos[0] : t.plan_proyectos;
  const estado = Array.isArray(t.plan_estados) ? t.plan_estados[0] : t.plan_estados;
  const relationship: TareaListRow["relationship"] =
    t.created_by === callerId ? "mio" : t.assignee_id === callerId ? "asignado" : "compartido";
  return {
    id: t.id,
    proyectoId: t.proyecto_id,
    proyectoName: proyecto?.name ?? "",
    parentTaskId: t.parent_task_id,
    title: t.title,
    description: t.description,
    estadoId: t.estado_id,
    estadoName: estado?.name ?? null,
    priority: t.priority,
    labels: t.labels ?? [],
    startDate: t.start_date,
    dueDate: t.due_date,
    assigneeId: t.assignee_id,
    cicloId: t.ciclo_id,
    createdBy: t.created_by,
    moduloIds: (t.plan_tarea_modulos ?? []).map((m) => m.modulo_id),
    relationship,
  };
}

const TAREA_SELECT =
  "id, proyecto_id, plan_proyectos(name), parent_task_id, title, description, estado_id, plan_estados(name), priority, labels, start_date, due_date, assignee_id, ciclo_id, created_by, plan_tarea_modulos(modulo_id)";

// Every task RLS lets the caller see, across every project - the landing
// screen (a later task) splits this into "Mis tareas" (relationship is
// "mio" or "asignado") and "Compartido conmigo" (relationship is
// "compartido") client-side, the same "fetch everything small, filter
// client-side" pattern used by Suministros' Tablero and Servicios
// Generales' Workspace.
export async function listTareasVisibles(): Promise<TareaListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_tareas")
    .select(TAREA_SELECT)
    .order("created_at", { ascending: false });

  return (data ?? []).map((t) => toTareaListRow(t as unknown as RawTareaRow, user.id));
}

// One project's full tree - used by the project detail screen (a later task).
export async function listTareasDeProyecto(proyectoId: string): Promise<TareaListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_tareas")
    .select(TAREA_SELECT)
    .eq("proyecto_id", proyectoId)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((t) => toTareaListRow(t as unknown as RawTareaRow, user.id));
}
