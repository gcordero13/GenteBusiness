"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSharePointUploadSession } from "@/lib/sharepoint";
import { validateUpload, type UploadKind } from "@/lib/aprendizaje/files";
import { toCursoDetail, toGestionCursoRow, type RawCurso } from "@/lib/aprendizaje/mapCurso";
import type { CursoCategory, CursoDetail, CursoStatus, DriveFileRef, GestionCursoRow } from "@/lib/aprendizaje/types";
import { toVideoEmbed } from "@/lib/aprendizaje/videoEmbed";

interface ActionResult {
  error?: string;
}

const CURSO_DETAIL_SELECT =
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, " +
  "aprendizaje_lecciones(id, position, title, body, video_url, video_drive_id, video_item_id, " +
  "aprendizaje_leccion_archivos(id, filename, content_type, size_bytes, drive_id, item_id, position))";

const CATEGORIES: CursoCategory[] = ["curso", "historia"];
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
