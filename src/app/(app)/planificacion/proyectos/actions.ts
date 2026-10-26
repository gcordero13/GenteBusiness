"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadSharePointAttachment } from "@/lib/sharepoint";

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

export interface CreateTareaInput {
  proyectoId: string;
  parentTaskId: string | null;
  title: string;
  description: string;
  estadoId: string | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  cicloId: string | null;
  moduloIds: string[];
}

export async function createTarea(input: CreateTareaInput): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título es obligatorio" };

  const { data: tarea, error } = await supabase
    .from("plan_tareas")
    .insert({
      proyecto_id: input.proyectoId,
      parent_task_id: input.parentTaskId,
      title: input.title.trim(),
      description: input.description.trim() || null,
      estado_id: input.estadoId,
      priority: input.priority,
      labels: input.labels,
      start_date: input.startDate,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      ciclo_id: input.cicloId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !tarea) return { error: error?.message ?? "No se pudo crear la tarea" };

  if (input.moduloIds.length > 0) {
    const { error: modError } = await supabase
      .from("plan_tarea_modulos")
      .insert(input.moduloIds.map((modulo_id) => ({ tarea_id: tarea.id, modulo_id })));
    if (modError) return { error: modError.message };
  }

  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${input.proyectoId}`);
  return { id: tarea.id };
}

export interface UpdateTareaInput {
  id: string;
  proyectoId: string;
  title: string;
  description: string;
  estadoId: string | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  cicloId: string | null;
  moduloIds: string[];
}

export async function updateTarea(input: UpdateTareaInput): Promise<ActionResult> {
  const supabase = await createClient();
  if (!input.title.trim()) return { error: "El título es obligatorio" };

  const { error } = await supabase
    .from("plan_tareas")
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      estado_id: input.estadoId,
      priority: input.priority,
      labels: input.labels,
      start_date: input.startDate,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      ciclo_id: input.cicloId,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  await supabase.from("plan_tarea_modulos").delete().eq("tarea_id", input.id);
  if (input.moduloIds.length > 0) {
    const { error: modError } = await supabase
      .from("plan_tarea_modulos")
      .insert(input.moduloIds.map((modulo_id) => ({ tarea_id: input.id, modulo_id })));
    if (modError) return { error: modError.message };
  }

  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${input.proyectoId}`);
  return {};
}

// proyectoId FIRST (unlike every other action in this file) so the project
// detail page (a later task) can pass
// `updateTareaEstado.bind(null, proyectoId)` down to the client-side
// ProyectosWorkspace as a `(tareaId, estadoId) => Promise<ActionResult>`
// bound Server Action - only a Server Action (not a plain async function)
// can cross the server-to-client prop boundary, and `.bind` only partially
// applies arguments from the front, which is why proyectoId is first here.
export async function updateTareaEstado(proyectoId: string, tareaId: string, estadoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tareas").update({ estado_id: estadoId }).eq("id", tareaId);
  if (error) return { error: error.message };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function updateTareaFecha(tareaId: string, dueDate: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tareas").update({ due_date: dueDate }).eq("id", tareaId);
  if (error) return { error: error.message };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteTarea(tareaId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tareas").delete().eq("id", tareaId);
  if (error) return { error: error.message };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export interface TareaAdjuntoRow {
  id: string;
  fileName: string;
  contentType: string | null;
  driveId: string;
  itemId: string;
}

export async function listAdjuntos(tareaId: string): Promise<TareaAdjuntoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_tarea_adjuntos")
    .select("id, file_name, content_type, drive_id, item_id")
    .eq("tarea_id", tareaId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    contentType: a.content_type,
    driveId: a.drive_id,
    itemId: a.item_id,
  }));
}

export async function addAdjunto(tareaId: string, proyectoId: string, file: File): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (file.size === 0) return { error: "Selecciona un archivo" };

  const uploadResult = await uploadSharePointAttachment(file);
  if (uploadResult.error) return { error: uploadResult.error };

  const { error } = await supabase.from("plan_tarea_adjuntos").insert({
    tarea_id: tareaId,
    file_name: file.name,
    content_type: file.type || null,
    drive_id: uploadResult.driveId,
    item_id: uploadResult.itemId,
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function removeAdjunto(adjuntoId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tarea_adjuntos").delete().eq("id", adjuntoId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export interface EstadoOption {
  id: string;
  name: string;
  color: string | null;
}

export async function listEstados(proyectoId: string): Promise<EstadoOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_estados")
    .select("id, name, color")
    .eq("proyecto_id", proyectoId)
    .order("sort_order");
  return (data ?? []).map((e) => ({ id: e.id, name: e.name, color: e.color }));
}

export async function createEstado(proyectoId: string, name: string, color: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!name.trim()) return { error: "El nombre es obligatorio" };

  const { data: existing } = await supabase
    .from("plan_estados")
    .select("sort_order")
    .eq("proyecto_id", proyectoId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("plan_estados")
    .insert({ proyecto_id: proyectoId, name: name.trim(), color: color || null, sort_order: nextSort });
  if (error) return { error: error.message };

  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteEstado(estadoId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_estados").delete().eq("id", estadoId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
