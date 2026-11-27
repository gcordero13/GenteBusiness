"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSharePointUploadSession } from "@/lib/sharepoint";
import { validateUpload, type UploadKind } from "@/lib/aprendizaje/files";
import { toCursoDetail, toGestionCursoRow, type RawCurso } from "@/lib/aprendizaje/mapCurso";
import { CATEGORIES } from "@/lib/aprendizaje/types";
import type {
  CursoCategory,
  CursoDetail,
  CursoStatus,
  DriveFileRef,
  EvalSettings,
  LeccionQuiz,
  GestionCursoRow,
  ModuloOption,
  Tutorial,
} from "@/lib/aprendizaje/types";
import { toTutorial, type RawTutorial } from "@/lib/aprendizaje/tutoriales";
import { toVideoEmbed } from "@/lib/aprendizaje/videoEmbed";
import {
  pesoTotal,
  toPreguntaGestion,
  validateEvalSettings,
  validatePregunta,
  validateQuiz,
  type PreguntaGestion,
  type PreguntaInput,
  type RawPregunta,
} from "@/lib/aprendizaje/evaluacion";

interface ActionResult {
  error?: string;
}

const CURSO_DETAIL_SELECT =
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, eval_passing_score, eval_max_attempts, anunciar_proximamente, tutorial_module_key, anunciar_al_iniciar, " +
  "firma_nombre, firma_cargo, firma_drive_id, firma_item_id, " +
  "aprendizaje_lecciones(id, position, title, body, video_url, video_drive_id, video_item_id, eval_questions_per_attempt, eval_weight, " +
  "aprendizaje_leccion_archivos(id, filename, content_type, size_bytes, drive_id, item_id, position))";

const STATUSES: CursoStatus[] = ["borrador", "publicado", "archivado"];

/** Every manager action re-checks can_manage server-side; RLS enforces it again on each write. */
async function managerClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "aprendizaje" });
  if (!data?.[0]?.can_manage) return null;
  return { supabase, userId: user.id };
}

function revalidateCurso(cursoId: string) {
  revalidatePath(`/aprendizaje/gestion/${cursoId}`);
  revalidatePath("/aprendizaje/gestion");
  revalidatePath(`/aprendizaje/${cursoId}`);
  revalidatePath("/aprendizaje");
}

export async function listCursosGestion(): Promise<GestionCursoRow[]> {
  const ctx = await managerClient();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from("aprendizaje_cursos")
    .select("id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, aprendizaje_lecciones(id)")
    .order("updated_at", { ascending: false });
  return ((data ?? []) as unknown as RawCurso[]).map(toGestionCursoRow);
}

export async function getCursoGestion(cursoId: string): Promise<CursoDetail | null> {
  const ctx = await managerClient();
  if (!ctx) return null;
  const { data } = await ctx.supabase.from("aprendizaje_cursos").select(CURSO_DETAIL_SELECT).eq("id", cursoId).maybeSingle();
  return data ? toCursoDetail(data as unknown as RawCurso, new Set(), null) : null;
}

export async function createCurso(input: {
  title: string;
  description: string;
  category: CursoCategory;
}): Promise<ActionResult & { id?: string }> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título es obligatorio." };
  if (!CATEGORIES.includes(input.category)) return { error: "Categoría inválida." };

  const { data, error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .insert({
      title: input.title.trim(),
      description: input.description.trim() || null,
      category: input.category,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear el curso." };
  revalidatePath("/aprendizaje/gestion");
  return { id: data.id };
}

export async function updateCurso(
  cursoId: string,
  input: { title: string; description: string; category: CursoCategory },
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título es obligatorio." };
  if (!CATEGORIES.includes(input.category)) return { error: "Categoría inválida." };

  const { error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .update({ title: input.title.trim(), description: input.description.trim() || null, category: input.category })
    .eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function setCursoStatus(cursoId: string, status: CursoStatus): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!STATUSES.includes(status)) return { error: "Estado inválido." };

  if (status === "publicado") {
    const { count } = await ctx.supabase
      .from("aprendizaje_lecciones")
      .select("id", { count: "exact", head: true })
      .eq("curso_id", cursoId);
    if (!count) return { error: "Agrega al menos una lección antes de publicar." };

    const problem = await quizProblems(ctx.supabase, cursoId);
    if (problem) return { error: problem };
  }

  const { error } = await ctx.supabase.from("aprendizaje_cursos").update({ status }).eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Only drafts can be deleted; published/archived courses may have progress worth keeping. */
export async function deleteCurso(cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { data: curso } = await ctx.supabase.from("aprendizaje_cursos").select("status").eq("id", cursoId).maybeSingle();
  if (!curso) return { error: "Curso no encontrado." };
  if (curso.status !== "borrador") return { error: "Solo se pueden eliminar cursos en borrador. Archívalo en su lugar." };

  const { error } = await ctx.supabase.from("aprendizaje_cursos").delete().eq("id", cursoId);
  if (error) return { error: error.message };
  revalidatePath("/aprendizaje/gestion");
  return {};
}

export async function setCursoCover(cursoId: string, cover: DriveFileRef | null): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .update({ cover_drive_id: cover?.driveId ?? null, cover_item_id: cover?.itemId ?? null })
    .eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Who signs the course's certificate. Empty text is stored as null. */
export async function setCursoFirma(
  cursoId: string,
  input: { nombre: string; cargo: string; imagen: DriveFileRef | null },
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const nombre = input.nombre.trim() || null;
  const cargo = input.cargo.trim() || null;
  if (!nombre && (cargo || input.imagen)) return { error: "Escribe el nombre de quien firma." };
  const { error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .update({
      firma_nombre: nombre,
      firma_cargo: cargo,
      firma_drive_id: input.imagen?.driveId ?? null,
      firma_item_id: input.imagen?.itemId ?? null,
    })
    .eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function createLeccion(cursoId: string, title: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!title.trim()) return { error: "El título de la lección es obligatorio." };

  const { data: last } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .select("position")
    .eq("curso_id", cursoId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .insert({ curso_id: cursoId, title: title.trim(), position: (last?.position ?? -1) + 1 });
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function updateLeccion(
  leccionId: string,
  cursoId: string,
  input: { title: string; body: string; videoUrl: string },
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título de la lección es obligatorio." };
  const videoUrl = input.videoUrl.trim();
  if (videoUrl && !toVideoEmbed(videoUrl)) return { error: "El enlace del video no es válido." };

  // A link replaces an uploaded video (the table allows only one of them).
  const videoPatch = videoUrl ? { video_url: videoUrl, video_drive_id: null, video_item_id: null } : { video_url: null };
  const { error } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .update({ title: input.title.trim(), body: input.body.trim() || null, ...videoPatch })
    .eq("id", leccionId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function setLeccionVideoFile(
  leccionId: string,
  cursoId: string,
  file: DriveFileRef | null,
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .update({ video_url: null, video_drive_id: file?.driveId ?? null, video_item_id: file?.itemId ?? null })
    .eq("id", leccionId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function deleteLeccion(leccionId: string, cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_lecciones").delete().eq("id", leccionId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function reorderLecciones(cursoId: string, orderedIds: string[]): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.rpc("aprendizaje_reordenar_lecciones", { p_curso_id: cursoId, p_ids: orderedIds });
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function addLeccionArchivo(
  leccionId: string,
  cursoId: string,
  file: DriveFileRef & { filename: string; contentType: string; sizeBytes: number },
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { count } = await ctx.supabase
    .from("aprendizaje_leccion_archivos")
    .select("id", { count: "exact", head: true })
    .eq("leccion_id", leccionId);
  const { error } = await ctx.supabase.from("aprendizaje_leccion_archivos").insert({
    leccion_id: leccionId,
    filename: file.filename,
    content_type: file.contentType || "application/octet-stream",
    size_bytes: file.sizeBytes,
    drive_id: file.driveId,
    item_id: file.itemId,
    position: count ?? 0,
  });
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function removeLeccionArchivo(archivoId: string, cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_leccion_archivos").delete().eq("id", archivoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Opens a Graph upload session; the browser then uploads the bytes itself. */
export async function startUpload(
  kind: UploadKind,
  file: { name: string; size: number; type: string },
): Promise<{ uploadUrl?: string; error?: string }> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const invalid = validateUpload(kind, file);
  if (invalid) return { error: invalid };
  try {
    const { uploadUrl } = await createSharePointUploadSession("aprendizaje", file.name);
    return { uploadUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo iniciar la subida." };
  }
}

/**
 * Why a course can't be published with its current quizzes, or null. The
 * quiz lessons' weights must add up to exactly 100, and every quiz needs at
 * least one active question, or nobody could ever complete the course.
 */
async function quizProblems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cursoId: string,
): Promise<string | null> {
  const { data: lecciones } = await supabase
    .from("aprendizaje_lecciones")
    .select("id, title, eval_questions_per_attempt, eval_weight")
    .eq("curso_id", cursoId);
  const conQuiz = (lecciones ?? []).filter((l) => l.eval_questions_per_attempt != null);
  if (conQuiz.length === 0) return null;

  const total = pesoTotal(conQuiz.map((l) => ({ quiz: { questionsPerAttempt: 1, weight: l.eval_weight ?? 0 } })));
  if (total !== 100) return `Los cuestionarios suman ${total}% y deben sumar exactamente 100%.`;

  const { data: activas } = await supabase
    .from("aprendizaje_preguntas")
    .select("leccion_id")
    .in(
      "leccion_id",
      conQuiz.map((l) => l.id),
    )
    .eq("active", true);
  const conPreguntas = new Set((activas ?? []).map((p) => p.leccion_id as string));
  const sinPreguntas = conQuiz.find((l) => !conPreguntas.has(l.id));
  return sinPreguntas
    ? `La lección “${sinPreguntas.title}” tiene cuestionario pero no tiene preguntas activas.`
    : null;
}

/** Every question of the course, each tagged with its lesson; the editor groups them. */
export async function listPreguntas(cursoId: string): Promise<PreguntaGestion[]> {
  const ctx = await managerClient();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from("aprendizaje_preguntas")
    .select("id, leccion_id, text, type, active, seconds, position, created_at, aprendizaje_opciones(id, text, is_correct, position)")
    .eq("curso_id", cursoId)
    .order("position")
    .order("created_at");
  return ((data ?? []) as unknown as RawPregunta[]).map(toPreguntaGestion);
}

export async function updateEvalSettings(cursoId: string, settings: EvalSettings): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const invalid = validateEvalSettings(settings);
  if (invalid) return { error: invalid };

  const { error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .update({ eval_passing_score: settings.passingScore, eval_max_attempts: settings.maxAttempts })
    .eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Turns a lesson's quiz on (with its weight and questions per person) or off (null). */
export async function setLeccionQuiz(
  leccionId: string,
  cursoId: string,
  quiz: LeccionQuiz | null,
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (quiz) {
    const invalid = validateQuiz(quiz);
    if (invalid) return { error: invalid };
  }
  const { error } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .update({
      eval_questions_per_attempt: quiz?.questionsPerAttempt ?? null,
      eval_weight: quiz?.weight ?? 0,
    })
    .eq("id", leccionId)
    .eq("curso_id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Creates or updates a question. Options keep their ids so open attempts still resolve them. */
export async function savePregunta(cursoId: string, leccionId: string, input: PreguntaInput): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const invalid = validatePregunta(input);
  if (invalid) return { error: invalid };

  let preguntaId = input.id;
  if (preguntaId) {
    const { error } = await ctx.supabase
      .from("aprendizaje_preguntas")
      .update({ text: input.text.trim(), type: input.type, seconds: input.seconds })
      .eq("id", preguntaId)
      .eq("curso_id", cursoId);
    if (error) return { error: error.message };
  } else {
    const { count } = await ctx.supabase
      .from("aprendizaje_preguntas")
      .select("id", { count: "exact", head: true })
      .eq("leccion_id", leccionId);
    const { data, error } = await ctx.supabase
      .from("aprendizaje_preguntas")
      .insert({
        curso_id: cursoId,
        leccion_id: leccionId,
        text: input.text.trim(),
        type: input.type,
        seconds: input.seconds,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "No se pudo guardar la pregunta." };
    preguntaId = data.id as string;
  }

  const keepIds = input.options.flatMap((o) => (o.id ? [o.id] : []));
  const { data: existing } = await ctx.supabase.from("aprendizaje_opciones").select("id").eq("pregunta_id", preguntaId);
  const removed = (existing ?? []).map((o) => o.id as string).filter((id) => !keepIds.includes(id));
  if (removed.length > 0) {
    const { error } = await ctx.supabase.from("aprendizaje_opciones").delete().in("id", removed);
    if (error) return { error: error.message };
  }

  for (const [position, option] of input.options.entries()) {
    const row = { text: option.text.trim(), is_correct: option.isCorrect, position };
    const { error } = option.id
      ? await ctx.supabase.from("aprendizaje_opciones").update(row).eq("id", option.id).eq("pregunta_id", preguntaId)
      : await ctx.supabase.from("aprendizaje_opciones").insert({ ...row, pregunta_id: preguntaId });
    if (error) return { error: error.message };
  }

  revalidateCurso(cursoId);
  return {};
}

export async function setPreguntaActiva(preguntaId: string, cursoId: string, active: boolean): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_preguntas").update({ active }).eq("id", preguntaId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function deletePregunta(preguntaId: string, cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_preguntas").delete().eq("id", preguntaId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function setAnunciarProximamente(cursoId: string, value: boolean): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_cursos").update({ anunciar_proximamente: value }).eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Platform modules a tutorial can belong to, for the selector. */
export async function listModulos(): Promise<ModuloOption[]> {
  const ctx = await managerClient();
  if (!ctx) return [];
  const { data } = await ctx.supabase.from("modules").select("key, label").order("label");
  return (data ?? []) as ModuloOption[];
}

// ---------------------------------------------------------------------------
// Tutorials (user, 2026-11-27): not courses - just a name, the module it
// belongs to and one video (file or link) or one image. Active as soon as
// they're saved; people with that module see them in Aprende and in a
// pop-up when the platform opens.

const TUTORIAL_SELECT =
  "id, title, module_key, video_url, video_drive_id, video_item_id, imagen_drive_id, imagen_item_id, active, modules(label)";

export async function listTutorialesGestion(): Promise<Tutorial[]> {
  const ctx = await managerClient();
  if (!ctx) return [];
  const { data } = await ctx.supabase.from("aprendizaje_tutoriales").select(TUTORIAL_SELECT).order("created_at", { ascending: false });
  return ((data ?? []) as unknown as RawTutorial[]).map(toTutorial);
}

/** What a tutorial shows: an uploaded video, a video link, or an image. */
export type TutorialMedio =
  | { tipo: "video"; file: DriveFileRef }
  | { tipo: "enlace"; url: string }
  | { tipo: "imagen"; file: DriveFileRef };

function medioColumns(medio: TutorialMedio) {
  return {
    video_drive_id: medio.tipo === "video" ? medio.file.driveId : null,
    video_item_id: medio.tipo === "video" ? medio.file.itemId : null,
    video_url: medio.tipo === "enlace" ? medio.url.trim() : null,
    imagen_drive_id: medio.tipo === "imagen" ? medio.file.driveId : null,
    imagen_item_id: medio.tipo === "imagen" ? medio.file.itemId : null,
  };
}

function revalidateTutoriales() {
  revalidatePath("/aprendizaje/gestion");
  revalidatePath("/aprendizaje");
  revalidatePath("/", "layout");
}

/** Creates a tutorial (no id) or updates it; `medio` null keeps the current video/image. */
export async function saveTutorial(input: {
  id?: string;
  title: string;
  moduleKey: string;
  medio: TutorialMedio | null;
}): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "Escribe el nombre del tutorial." };
  if (!input.moduleKey) return { error: "Elige el módulo del tutorial." };
  if (!input.id && !input.medio) return { error: "Sube un video o una imagen, o pega el enlace del video." };
  if (input.medio?.tipo === "enlace" && !toVideoEmbed(input.medio.url.trim())) {
    return { error: "El enlace del video no es válido." };
  }

  const row = {
    title: input.title.trim(),
    module_key: input.moduleKey,
    updated_at: new Date().toISOString(),
    ...(input.medio ? medioColumns(input.medio) : {}),
  };
  const { error } = input.id
    ? await ctx.supabase.from("aprendizaje_tutoriales").update(row).eq("id", input.id)
    : await ctx.supabase.from("aprendizaje_tutoriales").insert({ ...row, created_by: ctx.userId });
  if (error) return { error: error.message };
  revalidateTutoriales();
  return {};
}

export async function setTutorialActivo(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase
    .from("aprendizaje_tutoriales")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateTutoriales();
  return {};
}

export async function deleteTutorial(id: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_tutoriales").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateTutoriales();
  return {};
}
