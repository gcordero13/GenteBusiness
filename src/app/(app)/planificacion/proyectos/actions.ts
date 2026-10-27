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

  // The id is generated client-side and the insert is NOT chained with
  // .select() - a chained .select() after .insert() makes PostgREST issue
  // the INSERT with a RETURNING clause, which requires the brand-new row to
  // also pass the table's SELECT policy (plan_proyectos_select, which calls
  // plan_can_see_proyecto - a function that re-queries plan_proyectos
  // itself). Per Postgres's MVCC command-visibility rules, that internal
  // re-query cannot see a row inserted earlier in the SAME command, so the
  // SELECT-policy check spuriously fails even though the INSERT's own WITH
  // CHECK was satisfied - manifesting as the exact same "new row violates
  // row-level security policy" error. Issuing the SELECT as a separate,
  // later command (same transaction) avoids this: by then the row was
  // inserted by an earlier command and is visible normally.
  const newId = crypto.randomUUID();
  const { error: insertError } = await supabase
    .from("plan_proyectos")
    .insert({ id: newId, name: name.trim(), description: description.trim() || null, created_by: user.id });
  if (insertError) return { error: insertError.message };

  // Every new project starts with these three estados already in place -
  // confirmed with the user ("quiero que siempre se carguen los estados
  // que debería de estar: en espera, en proceso, completado"). Not
  // self-referential (plan_estados_select checks plan_can_see_proyecto,
  // which queries plan_proyectos - a different, already-committed row),
  // so no chained .select() issue here.
  const { error: estadosError } = await supabase.from("plan_estados").insert([
    { proyecto_id: newId, name: "En espera", color: "#94a3b8", sort_order: 0 },
    { proyecto_id: newId, name: "En proceso", color: "#3b82f6", sort_order: 1 },
    { proyecto_id: newId, name: "Completado", color: "#10b981", sort_order: 2 },
  ]);
  if (estadosError) return { error: estadosError.message };

  revalidatePath("/planificacion");
  return { id: newId };
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

  // No chained .select() - same RETURNING/MVCC-visibility issue as
  // createProyecto: plan_tareas_select's policy (plan_can_see_tarea) would
  // need to re-query plan_tareas for this very row, which isn't visible yet
  // within the same INSERT command. The id is generated client-side so
  // nothing needs to be read back.
  const newId = crypto.randomUUID();
  const { error } = await supabase.from("plan_tareas").insert({
    id: newId,
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
  });
  if (error) return { error: error.message };

  if (input.moduloIds.length > 0) {
    const { error: modError } = await supabase
      .from("plan_tarea_modulos")
      .insert(input.moduloIds.map((modulo_id) => ({ tarea_id: newId, modulo_id })));
    if (modError) return { error: modError.message };
  }

  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${input.proyectoId}`);
  return { id: newId };
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

  const { data, error } = await supabase
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
    .eq("id", input.id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };

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
  const { data, error } = await supabase.from("plan_tareas").update({ estado_id: estadoId }).eq("id", tareaId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function updateTareaFecha(tareaId: string, dueDate: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_tareas").update({ due_date: dueDate }).eq("id", tareaId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteTarea(tareaId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_tareas").delete().eq("id", tareaId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
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

  const { data: canEdit } = await supabase.rpc("plan_can_edit_tarea", { p_tarea_id: tareaId });
  if (!canEdit) return { error: "No autorizado" };

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
  const { data, error } = await supabase.from("plan_tarea_adjuntos").delete().eq("id", adjuntoId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export interface ComentarioRow {
  id: string;
  body: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export async function listComentarios(tareaId: string): Promise<ComentarioRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_tarea_comentarios")
    .select("id, body, created_by, created_at")
    .eq("tarea_id", tareaId)
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap(rows.map((c) => c.created_by));
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    createdBy: c.created_by,
    createdByName: nameByUserId.get(c.created_by) ?? c.created_by,
    createdAt: c.created_at,
  }));
}

export async function addComentario(tareaId: string, proyectoId: string, body: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!body.trim()) return { error: "Escribe un comentario" };

  // Not self-referential (plan_tarea_comentarios_select checks
  // plan_can_see_tarea, which queries plan_tareas - a different,
  // already-existing row), so unlike plan_proyectos/plan_tareas this
  // table has no RETURNING/MVCC-visibility issue - a chained .select()
  // would be safe here too, though this action doesn't need one.
  const { error } = await supabase
    .from("plan_tarea_comentarios")
    .insert({ tarea_id: tareaId, body: body.trim(), created_by: user.id });
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
  const { data, error } = await supabase.from("plan_estados").delete().eq("id", estadoId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export interface CicloRow {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export async function listCiclos(proyectoId: string): Promise<CicloRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_ciclos")
    .select("id, name, start_date, end_date")
    .eq("proyecto_id", proyectoId)
    .order("start_date", { ascending: true, nullsFirst: false });
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date }));
}

export async function createCiclo(
  proyectoId: string,
  name: string,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!name.trim()) return { error: "El nombre es obligatorio" };
  const { error } = await supabase
    .from("plan_ciclos")
    .insert({ proyecto_id: proyectoId, name: name.trim(), start_date: startDate || null, end_date: endDate || null });
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteCiclo(cicloId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_ciclos").delete().eq("id", cicloId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export interface ModuloRow {
  id: string;
  name: string;
  description: string | null;
}

export async function listModulos(proyectoId: string): Promise<ModuloRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_modulos")
    .select("id, name, description")
    .eq("proyecto_id", proyectoId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m) => ({ id: m.id, name: m.name, description: m.description }));
}

export async function createModulo(proyectoId: string, name: string, description: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!name.trim()) return { error: "El nombre es obligatorio" };
  const { error } = await supabase
    .from("plan_modulos")
    .insert({ proyecto_id: proyectoId, name: name.trim(), description: description.trim() || null });
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteModulo(moduloId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_modulos").delete().eq("id", moduloId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export interface CompartidoRow {
  id: string;
  appUserId: string;
  userName: string;
  accessLevel: "ver" | "editar";
}

async function buildUserNameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data: users } = await supabase.from("app_users").select("id, email").in("id", userIds);
  if (!users || users.length === 0) return new Map();
  const emails = users.map((u) => u.email);
  const { data: contacts } = await supabase.from("contacts").select("email, first_name, last_name").in("email", emails);
  const nameByEmail = new Map((contacts ?? []).map((c) => [c.email, `${c.first_name} ${c.last_name}`]));
  return new Map(users.map((u) => [u.id, nameByEmail.get(u.email) ?? u.email]));
}

export interface AssignableUser {
  id: string;
  name: string;
}

// Shared by the "Compartir" dialog (picking who to share with) and
// TareaCreateDialog's responsable picker - every active app_user, with a
// real display name resolved the same way as every other module this app
// has built (app_users rarely has a populated name field; resolve via the
// matching contacts row by email instead).
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const supabase = await createClient();
  const { data: users } = await supabase.from("app_users").select("id, email").eq("status", "active").order("email");
  if (!users || users.length === 0) return [];
  const nameByUserId = await buildUserNameMap(users.map((u) => u.id));
  return users.map((u) => ({ id: u.id, name: nameByUserId.get(u.id) ?? u.id }));
}

export async function listProyectoCompartidos(proyectoId: string): Promise<CompartidoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_proyecto_compartidos")
    .select("id, shared_with_app_user_id, access_level")
    .eq("proyecto_id", proyectoId);
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap(rows.map((r) => r.shared_with_app_user_id));
  return rows.map((r) => ({
    id: r.id,
    appUserId: r.shared_with_app_user_id,
    userName: nameByUserId.get(r.shared_with_app_user_id) ?? r.shared_with_app_user_id,
    accessLevel: r.access_level as "ver" | "editar",
  }));
}

export async function shareProyecto(
  proyectoId: string,
  appUserId: string,
  accessLevel: "ver" | "editar",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data, error } = await supabase
    .from("plan_proyecto_compartidos")
    .upsert(
      {
        proyecto_id: proyectoId,
        shared_with_app_user_id: appUserId,
        access_level: accessLevel,
        shared_by: user.id,
      },
      { onConflict: "proyecto_id,shared_with_app_user_id" },
    )
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function revokeProyectoShare(shareId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_proyecto_compartidos").delete().eq("id", shareId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function listTareaCompartidos(tareaId: string): Promise<CompartidoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_tarea_compartidos")
    .select("id, shared_with_app_user_id, access_level")
    .eq("tarea_id", tareaId);
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap(rows.map((r) => r.shared_with_app_user_id));
  return rows.map((r) => ({
    id: r.id,
    appUserId: r.shared_with_app_user_id,
    userName: nameByUserId.get(r.shared_with_app_user_id) ?? r.shared_with_app_user_id,
    accessLevel: r.access_level as "ver" | "editar",
  }));
}

export async function shareTarea(
  tareaId: string,
  proyectoId: string,
  appUserId: string,
  accessLevel: "ver" | "editar",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data, error } = await supabase
    .from("plan_tarea_compartidos")
    .upsert(
      { tarea_id: tareaId, shared_with_app_user_id: appUserId, access_level: accessLevel, shared_by: user.id },
      { onConflict: "tarea_id,shared_with_app_user_id" },
    )
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function revokeTareaShare(shareId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_tarea_compartidos").delete().eq("id", shareId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
