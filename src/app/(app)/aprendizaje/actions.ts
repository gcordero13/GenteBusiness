"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toCatalogCurso, toCursoDetail, type RawCurso } from "@/lib/aprendizaje/mapCurso";
import type { CatalogCurso, CursoDetail } from "@/lib/aprendizaje/types";

const CURSO_DETAIL_SELECT =
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, " +
  "aprendizaje_lecciones(id, position, title, body, video_url, video_drive_id, video_item_id, " +
  "aprendizaje_leccion_archivos(id, filename, content_type, size_bytes, drive_id, item_id, position))";

export async function aprendizajeFlags(): Promise<{ canView: boolean; canManage: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "aprendizaje" });
  const canManage = Boolean(data?.[0]?.can_manage);
  return { canView: Boolean(data?.[0]?.can_view) || canManage, canManage };
}

async function myProgress(): Promise<{ leccionIds: Set<string>; completedByCurso: Map<string, string | null> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { leccionIds: new Set(), completedByCurso: new Map() };

  const [{ data: progreso }, { data: inscripciones }] = await Promise.all([
    supabase.from("aprendizaje_progreso_lecciones").select("leccion_id").eq("app_user_id", user.id),
    supabase.from("aprendizaje_inscripciones").select("curso_id, completed_at").eq("app_user_id", user.id),
  ]);
  return {
    leccionIds: new Set((progreso ?? []).map((p) => p.leccion_id as string)),
    completedByCurso: new Map((inscripciones ?? []).map((i) => [i.curso_id as string, i.completed_at as string | null])),
  };
}

/** Published courses only - managers see drafts in Gestión, not in the catalog. */
export async function listCatalog(): Promise<CatalogCurso[]> {
  const supabase = await createClient();
  const [{ data }, progress] = await Promise.all([
    supabase
      .from("aprendizaje_cursos")
      .select("id, title, description, category, status, cover_drive_id, cover_item_id, aprendizaje_lecciones(id)")
      .eq("status", "publicado")
      .order("created_at", { ascending: false }),
    myProgress(),
  ]);
  return ((data ?? []) as unknown as RawCurso[]).map((raw) =>
    toCatalogCurso(raw, progress.leccionIds, progress.completedByCurso.get(raw.id) ?? null),
  );
}

export async function getCurso(cursoId: string): Promise<CursoDetail | null> {
  const supabase = await createClient();
  const [{ data }, progress] = await Promise.all([
    supabase.from("aprendizaje_cursos").select(CURSO_DETAIL_SELECT).eq("id", cursoId).maybeSingle(),
    myProgress(),
  ]);
  if (!data) return null;
  return toCursoDetail(data as unknown as RawCurso, progress.leccionIds, progress.completedByCurso.get(cursoId) ?? null);
}

export async function marcarLeccionVista(leccionId: string, cursoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionId });
  if (error) return { error: error.message };
  revalidatePath(`/aprendizaje/${cursoId}`);
  revalidatePath("/aprendizaje");
  return {};
}
