"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadSharePointAttachment } from "@/lib/sharepoint";
import { sendTareaAsignadaEmail } from "@/lib/sendTareaAsignadaEmail";
import { sendTareaCompletadaEmail } from "@/lib/sendTareaCompletadaEmail";
import { getSiteUrl } from "@/lib/siteUrl";

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

  // Every new project starts with these five estados already in place and
  // marked as default (is_default = true, non-deletable) - confirmed with
  // the user that Asignado/En proceso/En espera/Completado/Cancelado must
  // always exist, in that exact order. Not self-referential
  // (plan_estados_select checks plan_can_see_proyecto, which queries
  // plan_proyectos - a different, already-committed row), so no chained
  // .select() issue here.
  const { error: estadosError } = await supabase.from("plan_estados").insert([
    { proyecto_id: newId, name: "Asignado", color: "#8b5cf6", kind: "asignado", is_default: true, sort_order: 0 },
    { proyecto_id: newId, name: "En proceso", color: "#3b82f6", kind: "en_proceso", is_default: true, sort_order: 1 },
    { proyecto_id: newId, name: "En espera", color: "#94a3b8", kind: "en_espera", is_default: true, sort_order: 2 },
    { proyecto_id: newId, name: "Completado", color: "#10b981", kind: "completado", is_default: true, sort_order: 3 },
    { proyecto_id: newId, name: "Cancelado", color: "#ef4444", kind: "cancelado", is_default: true, sort_order: 4 },
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

// Deleting the whole project is restricted to its creator at the RLS layer
// (plan_proyectos_delete) - more destructive than editing it, so not
// extended to editar-level share holders. Every plan_tareas/plan_estados/
// plan_ciclos/plan_modulos/plan_proyecto_compartidos row for this project
// cascades via its own FK's ON DELETE CASCADE, so a single delete here is
// enough.
export async function deleteProyecto(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_proyectos").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el proyecto ya no existe" };
  revalidatePath("/planificacion");
  return {};
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
  estadoColor: string | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneePhotoUrl: string | null;
  cicloId: string | null;
  planificacionId: string | null;
  planificacionName: string | null;
  createdBy: string;
  creatorName: string;
  creatorPhotoUrl: string | null;
  moduloIds: string[];
  relationship: "mio" | "asignado" | "compartido";
  percentComplete: number;
  color: string | null;
  // True when at least one other visible task has parent_task_id = this
  // row's id, i.e. this is a "parent" whose percentComplete is computed by
  // the plan_recompute_ancestor_percent trigger, not user-editable. Only as
  // complete as the fetch it came from: a child visible only through a
  // different visibility path (e.g. direct assignment, not the
  // project/share cascade) could be missing from that same batch, making a
  // true parent read as a false leaf here. updateTareaPercent re-checks
  // this against the database itself and is the actual authority.
  hasChildren: boolean;
}

interface RawTareaRow {
  id: string;
  proyecto_id: string;
  plan_proyectos: { name: string } | { name: string }[] | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  estado_id: string | null;
  plan_estados: { name: string; color: string | null } | { name: string; color: string | null }[] | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[] | null;
  start_date: string | null;
  due_date: string | null;
  assignee_id: string | null;
  ciclo_id: string | null;
  planificacion_id: string | null;
  plan_planificaciones: { name: string } | { name: string }[] | null;
  created_by: string;
  plan_tarea_modulos: { modulo_id: string }[] | null;
  percent_complete: number;
  color: string | null;
}

function toTareaListRow(t: RawTareaRow, callerId: string): TareaListRow {
  const proyecto = Array.isArray(t.plan_proyectos) ? t.plan_proyectos[0] : t.plan_proyectos;
  const estado = Array.isArray(t.plan_estados) ? t.plan_estados[0] : t.plan_estados;
  const planificacion = Array.isArray(t.plan_planificaciones) ? t.plan_planificaciones[0] : t.plan_planificaciones;
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
    estadoColor: estado?.color ?? null,
    priority: t.priority,
    labels: t.labels ?? [],
    startDate: t.start_date,
    dueDate: t.due_date,
    assigneeId: t.assignee_id,
    assigneeName: null,
    assigneePhotoUrl: null,
    cicloId: t.ciclo_id,
    planificacionId: t.planificacion_id,
    planificacionName: planificacion?.name ?? null,
    createdBy: t.created_by,
    creatorName: t.created_by,
    creatorPhotoUrl: null,
    moduloIds: (t.plan_tarea_modulos ?? []).map((m) => m.modulo_id),
    relationship,
    percentComplete: t.percent_complete,
    color: t.color,
    hasChildren: false,
  };
}

// hasChildren can only be known once the whole fetched batch is in hand (it
// depends on whether any OTHER row in the same batch points back at this
// one), so toTareaListRow always sets it false and this pass corrects it.
function attachHasChildren(rows: TareaListRow[]): TareaListRow[] {
  const parentIds = new Set<string>();
  for (const row of rows) {
    if (row.parentTaskId) parentIds.add(row.parentTaskId);
  }
  return rows.map((row) => ({ ...row, hasChildren: parentIds.has(row.id) }));
}

const TAREA_SELECT =
  "id, proyecto_id, plan_proyectos(name), parent_task_id, title, description, estado_id, plan_estados(name, color), priority, labels, start_date, due_date, assignee_id, ciclo_id, planificacion_id, plan_planificaciones(name), created_by, plan_tarea_modulos(modulo_id), percent_complete, color";

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

  const rows = attachHasChildren((data ?? []).map((t) => toTareaListRow(t as unknown as RawTareaRow, user.id)));
  return attachProfiles(rows);
}

// Tasks I created whose current assignee's account is no longer active -
// confirmed with the user: when someone is deactivated, their open work
// needs to surface somewhere so it can be reassigned. Scoped to tasks I
// created (not every task I can merely see) since reassigning requires
// edit rights, and "mio" is the relationship that maps to real ownership.
export async function listTareasConAsigneeInactivo(): Promise<TareaListRow[]> {
  const all = await listTareasVisibles();
  const mine = all.filter((t) => t.relationship === "mio" && t.assigneeId);
  if (mine.length === 0) return [];

  const admin = createAdminClient();
  const assigneeIds = Array.from(new Set(mine.map((t) => t.assigneeId as string)));
  const { data: users } = await admin.from("app_users").select("id, status").in("id", assigneeIds);
  const inactiveIds = new Set((users ?? []).filter((u) => u.status !== "active").map((u) => u.id));

  return mine.filter((t) => inactiveIds.has(t.assigneeId as string));
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

  const rows = attachHasChildren((data ?? []).map((t) => toTareaListRow(t as unknown as RawTareaRow, user.id)));
  return attachProfiles(rows);
}

// A task's direct sub-tasks, for the simple To-Do-style checklist in its
// detail view. hasChildren here is only as accurate as THIS batch (direct
// children of parentTaskId) - a sub-task that itself has further sub-tasks
// would show as editable here, but correctly read-only once opened in its
// own detail modal, which re-fetches against its real sibling set.
export async function listSubtareas(parentTaskId: string): Promise<TareaListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_tareas")
    .select(TAREA_SELECT)
    .eq("parent_task_id", parentTaskId)
    .order("sort_order", { ascending: true });

  const rows = attachHasChildren((data ?? []).map((t) => toTareaListRow(t as unknown as RawTareaRow, user.id)));
  return attachProfiles(rows);
}

// Fetches one task fresh, with an authoritative (DB-checked, not
// batch-local) hasChildren. Used by TareaDetailModal to refresh the
// currently-open task after adding/toggling one of its sub-tasks, since
// that changes THIS task's own rollup-computed percent/estado server-side,
// but the already-rendered `tarea` prop the modal was opened with has no
// way to know that on its own.
export async function getTarea(id: string): Promise<TareaListRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("plan_tareas").select(TAREA_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;

  const row = toTareaListRow(data as unknown as RawTareaRow, user.id);
  row.hasChildren = await taskHasChildren(supabase, id);
  const [withProfile] = await attachProfiles([row]);
  return withProfile;
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
  planificacionId: string | null;
  color: string | null;
  moduloIds: string[];
}

// A task with no children has user-owned percentComplete (defense in depth
// also enforced server-side here, not just in the UI): updateTareaPercent
// is the only action allowed to write it directly, and updateTarea/
// updateTareaEstado skip every percent-related side effect once a task has
// children, leaving that column exclusively owned by
// plan_recompute_ancestor_percent for such tasks.
async function taskHasChildren(supabase: Awaited<ReturnType<typeof createClient>>, tareaId: string): Promise<boolean> {
  const { count } = await supabase
    .from("plan_tareas")
    .select("id", { count: "exact", head: true })
    .eq("parent_task_id", tareaId);
  return (count ?? 0) > 0;
}

// Shared by updateTarea (editing the Estado field directly) and
// updateTareaEstado (Tablero drag-and-drop) so both entry points apply the
// same leaf-only 100<->99 forcing rule: moving a leaf task's estado to the
// project's completado estado forces percent to 100; moving it away from
// completado while sitting at 100 forces it down to 99 (a leaf task can
// never show 100% while not actually marked Completado). Returns the
// percent to additionally write, or null when no forcing is needed.
async function resolveEstadoPercentSideEffects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentPercent: number,
  newEstadoId: string | null,
): Promise<number | null> {
  let isCompletado = false;
  if (newEstadoId) {
    const { data: estado } = await supabase.from("plan_estados").select("kind").eq("id", newEstadoId).maybeSingle();
    isCompletado = estado?.kind === "completado";
  }
  if (isCompletado && currentPercent !== 100) return 100;
  if (!isCompletado && currentPercent === 100) return 99;
  return null;
}

// Confirmed with the user: "es asignado cuando se selecciona el nombre de
// la persona que realizará la tarea" - picking a NEW assignee always moves
// the task to the project's asignado-kind estado, except when the estado
// it's about to be saved with is already completado (marking something
// done and handing it to someone at the same time shouldn't un-complete
// it). The person then moves it to En proceso/En espera/etc. themselves.
async function resolveAsignadoOverride(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proyectoId: string,
  resultingEstadoId: string | null,
): Promise<string | null> {
  if (resultingEstadoId) {
    const { data: estado } = await supabase.from("plan_estados").select("kind").eq("id", resultingEstadoId).maybeSingle();
    if (estado?.kind === "completado") return null;
  }
  const { data: asignado } = await supabase
    .from("plan_estados")
    .select("id")
    .eq("proyecto_id", proyectoId)
    .eq("kind", "asignado")
    .maybeSingle();
  return asignado?.id ?? null;
}

// Fires whenever a task gets a new assignee - both at creation and via
// updateTarea's edit form (confirmed with the user: "cada vez que se
// asigne una tarea... le llegue la notificación"). Skipped when assigning
// to yourself (no point notifying someone of their own action) and never
// allowed to fail the assignment itself - email delivery problems (bad
// SMTP config, a user with no email on file) are swallowed, not surfaced
// as an error on the save.
async function notifyTareaAsignada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignerId: string,
  assigneeId: string,
  tareaTitle: string,
  proyectoId: string,
): Promise<void> {
  if (assigneeId === assignerId) return;
  try {
    const admin = createAdminClient();
    const [{ data: assignee }, { data: proyecto }, nameByUserId, siteUrl] = await Promise.all([
      admin.from("app_users").select("email").eq("id", assigneeId).maybeSingle(),
      supabase.from("plan_proyectos").select("name").eq("id", proyectoId).maybeSingle(),
      buildUserNameMap([assigneeId, assignerId]),
      getSiteUrl(),
    ]);
    if (!assignee?.email) return;
    await sendTareaAsignadaEmail({
      assigneeEmail: assignee.email,
      assigneeName: nameByUserId.get(assigneeId) ?? assignee.email,
      tareaTitle,
      proyectoName: proyecto?.name ?? "",
      assignedByName: nameByUserId.get(assignerId) ?? "Alguien",
      proyectoUrl: `${siteUrl}/planificacion/proyectos/${proyectoId}`,
    });
  } catch (err) {
    // Never block the assignment on an email delivery failure - logged
    // (not silently swallowed) so a misconfigured SMTP/missing email is
    // diagnosable from the function logs instead of just "not arriving".
    console.error("notifyTareaAsignada failed", err);
  }
}

// Notifies the task's creator when it transitions INTO the project's
// completado estado - confirmed with the user ("enviarle una notificación
// ... a la persona que asignó la tarea para cuando se complete"); the
// task's creator is the closest equivalent this schema tracks to "who
// assigned it". Only fires on a genuine transition (previousEstadoId !==
// newEstadoId), not on every save of an already-completed task, and skips
// notifying someone of their own action, same as notifyTareaAsignada.
async function notifyTareaCompletada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  tareaId: string,
  tareaTitle: string,
  proyectoId: string,
  previousEstadoId: string | null,
  newEstadoId: string | null,
): Promise<void> {
  if (!newEstadoId || newEstadoId === previousEstadoId) return;
  try {
    const { data: estado } = await supabase.from("plan_estados").select("kind").eq("id", newEstadoId).maybeSingle();
    if (estado?.kind !== "completado") return;

    const { data: tarea } = await supabase.from("plan_tareas").select("created_by").eq("id", tareaId).maybeSingle();
    if (!tarea || tarea.created_by === actorId) return;

    const admin = createAdminClient();
    const [{ data: creator }, { data: proyecto }, nameByUserId, siteUrl] = await Promise.all([
      admin.from("app_users").select("email").eq("id", tarea.created_by).maybeSingle(),
      supabase.from("plan_proyectos").select("name").eq("id", proyectoId).maybeSingle(),
      buildUserNameMap([actorId]),
      getSiteUrl(),
    ]);
    if (!creator?.email) return;
    await sendTareaCompletadaEmail({
      creatorEmail: creator.email,
      tareaTitle,
      proyectoName: proyecto?.name ?? "",
      completedByName: nameByUserId.get(actorId) ?? "Alguien",
      proyectoUrl: `${siteUrl}/planificacion/proyectos/${proyectoId}`,
    });
  } catch (err) {
    console.error("notifyTareaCompletada failed", err);
  }
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
  // Assigning a task bumps it to 5% (confirmed with the user) - applies at
  // creation the same as it does in updateTarea. Then re-checked against
  // the chosen initial estado: picking a completado-kind estado up front
  // (e.g. logging already-finished work) must still force 100%, the same
  // as it would via updateTarea/updateTareaEstado - resolveEstadoPercentSideEffects
  // can't downgrade a freshly-created task to 99 here (the base value is
  // never 100), so only the forcing-to-100 branch can apply.
  const basePercent = input.assigneeId ? 5 : 0;
  const percentComplete = (await resolveEstadoPercentSideEffects(supabase, basePercent, input.estadoId)) ?? basePercent;

  let estadoId = input.estadoId;
  if (input.assigneeId) {
    estadoId = (await resolveAsignadoOverride(supabase, input.proyectoId, estadoId)) ?? estadoId;
  }

  const newId = crypto.randomUUID();
  const { error } = await supabase.from("plan_tareas").insert({
    id: newId,
    proyecto_id: input.proyectoId,
    parent_task_id: input.parentTaskId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    estado_id: estadoId,
    priority: input.priority,
    labels: input.labels,
    start_date: input.startDate,
    due_date: input.dueDate,
    assignee_id: input.assigneeId,
    ciclo_id: input.cicloId,
    planificacion_id: input.planificacionId,
    color: input.color,
    percent_complete: percentComplete,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  if (input.moduloIds.length > 0) {
    const { error: modError } = await supabase
      .from("plan_tarea_modulos")
      .insert(input.moduloIds.map((modulo_id) => ({ tarea_id: newId, modulo_id })));
    if (modError) return { error: modError.message };
  }

  if (input.assigneeId) {
    await notifyTareaAsignada(supabase, user.id, input.assigneeId, input.title.trim(), input.proyectoId);
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
  planificacionId: string | null;
  color: string | null;
  moduloIds: string[];
}

export async function updateTarea(input: UpdateTareaInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título es obligatorio" };

  const { data: current } = await supabase
    .from("plan_tareas")
    .select("percent_complete, assignee_id, estado_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!current) return { error: "No autorizado o el registro ya no existe" };

  // Percent is exclusively owned by the auto-rollup trigger once a task has
  // children (see taskHasChildren) - none of the sync rules below apply to
  // it, to avoid a write-tug-of-war between this code and the trigger.
  let percentComplete: number | undefined;
  if (!(await taskHasChildren(supabase, input.id))) {
    if (current.assignee_id === null && input.assigneeId !== null && current.percent_complete === 0) {
      percentComplete = 5;
    }
    const forcedPercent = await resolveEstadoPercentSideEffects(supabase, percentComplete ?? current.percent_complete, input.estadoId);
    if (forcedPercent !== null) percentComplete = forcedPercent;
  }

  const reassigned = input.assigneeId !== null && input.assigneeId !== current.assignee_id;
  const estadoId = reassigned
    ? ((await resolveAsignadoOverride(supabase, input.proyectoId, input.estadoId)) ?? input.estadoId)
    : input.estadoId;

  const { data, error } = await supabase
    .from("plan_tareas")
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      estado_id: estadoId,
      priority: input.priority,
      labels: input.labels,
      start_date: input.startDate,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      ciclo_id: input.cicloId,
      planificacion_id: input.planificacionId,
      color: input.color,
      ...(percentComplete !== undefined ? { percent_complete: percentComplete } : {}),
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

  if (reassigned) {
    await notifyTareaAsignada(supabase, user.id, input.assigneeId as string, input.title.trim(), input.proyectoId);
  }
  await notifyTareaCompletada(supabase, user.id, input.id, input.title.trim(), input.proyectoId, current.estado_id, estadoId);

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: current } = await supabase
    .from("plan_tareas")
    .select("percent_complete, estado_id, title")
    .eq("id", tareaId)
    .maybeSingle();
  if (!current) return { error: "No autorizado o el registro ya no existe" };

  const update: { estado_id: string; percent_complete?: number } = { estado_id: estadoId };
  if (!(await taskHasChildren(supabase, tareaId))) {
    const forcedPercent = await resolveEstadoPercentSideEffects(supabase, current.percent_complete, estadoId);
    if (forcedPercent !== null) update.percent_complete = forcedPercent;
  }

  const { data, error } = await supabase.from("plan_tareas").update(update).eq("id", tareaId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };

  await notifyTareaCompletada(supabase, user.id, tareaId, current.title, proyectoId, current.estado_id, estadoId);

  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

// Leaf-only direct percent edit (the detail view's slider). A task with
// children rejects the write outright - percent is computed by
// plan_recompute_ancestor_percent for those, regardless of what the UI
// sent (the UI itself also hides the slider for such tasks - this is the
// server-side half of that same defense-in-depth enforcement).
export async function updateTareaPercent(tareaId: string, percent: number, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { error: "El porcentaje debe ser un entero entre 0 y 100" };
  }

  const { data: tarea } = await supabase
    .from("plan_tareas")
    .select("proyecto_id, estado_id, title")
    .eq("id", tareaId)
    .maybeSingle();
  if (!tarea) return { error: "No autorizado o el registro ya no existe" };

  if (await taskHasChildren(supabase, tareaId)) {
    return { error: "El % de una tarea con subtareas se calcula automáticamente a partir de ellas" };
  }

  const update: { percent_complete: number; estado_id?: string } = { percent_complete: percent };
  if (percent === 100) {
    const { data: completado } = await supabase
      .from("plan_estados")
      .select("id")
      .eq("proyecto_id", tarea.proyecto_id)
      .eq("kind", "completado")
      .maybeSingle();
    if (completado) update.estado_id = completado.id;
  } else if (tarea.estado_id) {
    // Mirror image of the 100%<->completado forcing rule: a leaf task can't
    // be left showing Completado while sitting below 100% either, so
    // dragging the slider back down moves it off completado into the
    // project's en_proceso estado (when one exists).
    const { data: currentEstado } = await supabase.from("plan_estados").select("kind").eq("id", tarea.estado_id).maybeSingle();
    if (currentEstado?.kind === "completado") {
      const { data: enProceso } = await supabase
        .from("plan_estados")
        .select("id")
        .eq("proyecto_id", tarea.proyecto_id)
        .eq("kind", "en_proceso")
        .maybeSingle();
      if (enProceso) update.estado_id = enProceso.id;
    }
  }

  const { data, error } = await supabase.from("plan_tareas").update(update).eq("id", tareaId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };

  if (update.estado_id) {
    await notifyTareaCompletada(supabase, user.id, tareaId, tarea.title, proyectoId, tarea.estado_id, update.estado_id);
  }

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
  kind: string | null;
  isDefault: boolean;
}

export async function listEstados(proyectoId: string): Promise<EstadoOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_estados")
    .select("id, name, color, kind, is_default")
    .eq("proyecto_id", proyectoId)
    .order("sort_order");
  return (data ?? []).map((e) => ({ id: e.id, name: e.name, color: e.color, kind: e.kind, isDefault: e.is_default }));
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
  const { data: estado } = await supabase.from("plan_estados").select("is_default").eq("id", estadoId).single();
  if (estado?.is_default) return { error: "Este estado es parte de los estados base y no se puede eliminar" };
  const { data, error } = await supabase.from("plan_estados").delete().eq("id", estadoId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

// Drag-to-reorder the estado chips/Tablero columns - confirmed with the
// user: a fully custom order, not just the seeded default. orderedIds is
// the complete list in its new order; sort_order is rewritten to match
// each one's index. plan_estados_update's RLS (plan_can_edit_proyecto)
// still gates every one of these writes.
export async function reorderEstados(proyectoId: string, orderedIds: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from("plan_estados").update({ sort_order: index }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
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

export interface PlanificacionRow {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

// The hierarchy layer between a project and its (root) tasks - confirmed
// with the user: Proyecto -> Planificación -> Tarea -> Subtarea. Strictly
// one-per-task (via plan_tareas.planificacion_id), unlike the many-to-many
// plan_modulos tags below.
export async function listPlanificaciones(proyectoId: string): Promise<PlanificacionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_planificaciones")
    .select("id, name, description, sort_order")
    .eq("proyecto_id", proyectoId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, description: p.description, sortOrder: p.sort_order }));
}

export async function createPlanificacion(proyectoId: string, name: string, description: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!name.trim()) return { error: "El nombre es obligatorio" };

  const { data: existing } = await supabase
    .from("plan_planificaciones")
    .select("sort_order")
    .eq("proyecto_id", proyectoId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("plan_planificaciones").insert({
    proyecto_id: proyectoId,
    name: name.trim(),
    description: description.trim() || null,
    created_by: user.id,
    sort_order: nextSort,
  });
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deletePlanificacion(planificacionId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_planificaciones").delete().eq("id", planificacionId).select("id");
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

// app_users' own SELECT policy only allows seeing your own row (or a
// platform user-manager seeing everyone) - contacts' SELECT policy is
// gated by its own can_view module flag. Planificación has no role-profile
// gate at all, so most callers here can't see ANY other user's row through
// the request-scoped client, making every name/email lookup across this
// file silently come back empty for them. The admin client (service role,
// bypasses RLS) is used here instead, same as the identical join in
// planificacion/lideres/actions.ts - this is read-only name/email/photo
// resolution for display and notifications, not an authorization check.
async function buildUserNameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").in("id", userIds);
  if (!users || users.length === 0) return new Map();
  const emails = users.map((u) => u.email);
  const { data: contacts } = await admin.from("contacts").select("email, first_name, last_name").in("email", emails);
  const nameByEmail = new Map((contacts ?? []).map((c) => [c.email, `${c.first_name} ${c.last_name}`]));
  return new Map(users.map((u) => [u.id, nameByEmail.get(u.email) ?? u.email]));
}

interface UserProfile {
  name: string;
  photoUrl: string | null;
}

// Same join as buildUserNameMap, with photo_url added - used to show who's
// assigned/who created a task (avatar + name) in the Jerarquía/Lista views
// and the task detail modal. Unlike listAssignableUsers, this is for
// already-recorded assignments, so an email fallback (not an active-only
// filter) is kept - someone who left is still a real past assignee worth
// identifying.
async function buildUserProfileMap(userIds: string[]): Promise<Map<string, UserProfile>> {
  if (userIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").in("id", userIds);
  if (!users || users.length === 0) return new Map();
  const emails = users.map((u) => u.email);
  const { data: contacts } = await admin
    .from("contacts")
    .select("email, first_name, last_name, photo_url")
    .in("email", emails);
  const profileByEmail = new Map(
    (contacts ?? []).map((c) => [c.email, { name: `${c.first_name} ${c.last_name}`, photoUrl: c.photo_url }]),
  );
  return new Map(users.map((u) => [u.id, profileByEmail.get(u.email) ?? { name: u.email, photoUrl: null }]));
}

// Attaches assignee/creator display profiles once the whole fetched batch is
// in hand, mirroring attachHasChildren's two-pass shape (one query to
// resolve every distinct id in the batch, rather than one per row).
async function attachProfiles(rows: TareaListRow[]): Promise<TareaListRow[]> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.assigneeId) ids.add(row.assigneeId);
    ids.add(row.createdBy);
  }
  const profileById = await buildUserProfileMap(Array.from(ids));
  return rows.map((row) => ({
    ...row,
    assigneeName: row.assigneeId ? (profileById.get(row.assigneeId)?.name ?? null) : null,
    assigneePhotoUrl: row.assigneeId ? (profileById.get(row.assigneeId)?.photoUrl ?? null) : null,
    creatorName: profileById.get(row.createdBy)?.name ?? row.createdBy,
    creatorPhotoUrl: profileById.get(row.createdBy)?.photoUrl ?? null,
  }));
}

export interface AssignableUser {
  id: string;
  name: string;
}

// Used by CompartirDialog to exclude the current user from the "share
// with" picker - sharing with yourself is meaningless and the RLS policy
// rejects it outright.
export async function getCurrentAppUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Shared by the "Compartir" dialog (picking who to share with) and the
// responsable picker - every active app_user, with a real display name
// resolved via the matching contacts row by email. Confirmed with the user:
// no raw emails should ever show here, and a user with no active contacts
// record (inactive/terminated employee, or no linked contact at all) must
// be excluded entirely rather than falling back to their email - unlike
// buildUserNameMap (used for already-recorded things like comment authors,
// where showing SOME identifier for history is more useful than hiding it),
// this list is for picking someone NEW, so only real, active people belong.
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").eq("status", "active");
  if (!users || users.length === 0) return [];
  const emails = users.map((u) => u.email);
  const { data: contacts } = await admin
    .from("contacts")
    .select("email, first_name, last_name")
    .in("email", emails)
    .eq("status", "active");
  const nameByEmail = new Map((contacts ?? []).map((c) => [c.email, `${c.first_name} ${c.last_name}`]));
  return users
    .map((u) => ({ id: u.id, name: nameByEmail.get(u.email) ?? null }))
    .filter((u): u is AssignableUser => u.name !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
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
  // The RLS policy's WITH CHECK rejects shared_with_app_user_id = auth.uid()
  // (sharing with yourself) - caught here first for a message that actually
  // explains what went wrong instead of the raw "violates row-level
  // security policy" error.
  if (appUserId === user.id) return { error: "No puedes compartir el proyecto contigo mismo" };

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
  if (appUserId === user.id) return { error: "No puedes compartir la tarea contigo mismo" };

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
