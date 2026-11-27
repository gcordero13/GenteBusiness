"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toCatalogCurso, toCursoDetail, type RawCurso } from "@/lib/aprendizaje/mapCurso";
import type { CatalogCurso, CursoDetail, PerfilAprendizaje, ProximoCurso, Tutorial } from "@/lib/aprendizaje/types";
import { toTutorial, type RawTutorial } from "@/lib/aprendizaje/tutoriales";
import {
  summarizeIntentosPorLeccion,
  type EvaluacionEstado,
  type IntentoDetail,
  type IntentoResultado,
  type PreguntaIntento,
} from "@/lib/aprendizaje/evaluacion";

const CURSO_DETAIL_SELECT =
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, eval_passing_score, eval_max_attempts, anunciar_proximamente, " +
  "aprendizaje_lecciones(id, position, title, body, video_url, video_drive_id, video_item_id, eval_questions_per_attempt, eval_weight, " +
  "aprendizaje_leccion_archivos(id, filename, content_type, size_bytes, drive_id, item_id, position))";

export async function aprendizajeFlags(): Promise<{ canView: boolean; canManage: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "aprendizaje" });
  const canManage = Boolean(data?.[0]?.can_manage);
  return { canView: Boolean(data?.[0]?.can_view) || canManage, canManage };
}

async function myProgress(): Promise<{
  leccionIds: Set<string>;
  completedByCurso: Map<string, string | null>;
  bestScoreByLeccion: Map<string, number>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { leccionIds: new Set(), completedByCurso: new Map(), bestScoreByLeccion: new Map() };

  const [{ data: progreso }, { data: inscripciones }, { data: intentos }] = await Promise.all([
    supabase.from("aprendizaje_progreso_lecciones").select("leccion_id").eq("app_user_id", user.id),
    supabase.from("aprendizaje_inscripciones").select("curso_id, completed_at").eq("app_user_id", user.id),
    supabase
      .from("aprendizaje_intentos")
      .select("leccion_id, score")
      .eq("app_user_id", user.id)
      .not("submitted_at", "is", null),
  ]);
  const bestScoreByLeccion = new Map<string, number>();
  for (const i of intentos ?? []) {
    const score = (i.score as number | null) ?? 0;
    if (!i.leccion_id) continue; // attempts from the old course-level evaluation
    bestScoreByLeccion.set(i.leccion_id as string, Math.max(score, bestScoreByLeccion.get(i.leccion_id as string) ?? 0));
  }
  return {
    leccionIds: new Set((progreso ?? []).map((p) => p.leccion_id as string)),
    completedByCurso: new Map((inscripciones ?? []).map((i) => [i.curso_id as string, i.completed_at as string | null])),
    bestScoreByLeccion,
  };
}

/** Published courses only - managers see drafts in Gestión, not in the catalog. */
export async function listCatalog(): Promise<CatalogCurso[]> {
  const supabase = await createClient();
  const [{ data }, progress] = await Promise.all([
    supabase
      .from("aprendizaje_cursos")
      .select("id, title, description, category, status, cover_drive_id, cover_item_id, aprendizaje_lecciones(id, eval_questions_per_attempt, eval_weight)")
      .eq("status", "publicado")
      .order("created_at", { ascending: false }),
    myProgress(),
  ]);
  return ((data ?? []) as unknown as RawCurso[]).map((raw) =>
    toCatalogCurso(
      raw,
      progress.leccionIds,
      progress.completedByCurso.has(raw.id) ? { completedAt: progress.completedByCurso.get(raw.id) ?? null } : null,
      progress.bestScoreByLeccion,
    ),
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

/** The caller's attempts on each lesson quiz of the course, keyed by lesson id. */
export async function getCuestionariosEstado(cursoId: string): Promise<Record<string, EvaluacionEstado>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  // Filter by user explicitly: managers can read everyone's attempts.
  const { data } = await supabase
    .from("aprendizaje_intentos")
    .select("id, leccion_id, submitted_at, score, passed")
    .eq("curso_id", cursoId)
    .eq("app_user_id", user.id);
  return Object.fromEntries(summarizeIntentosPorLeccion(data ?? []));
}

export async function iniciarCuestionario(
  leccionId: string,
  cursoId: string,
): Promise<{ intentoId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aprendizaje_iniciar_cuestionario", { p_leccion_id: leccionId });
  if (error) return { error: error.message };
  revalidatePath(`/aprendizaje/${cursoId}`);
  return { intentoId: data as string };
}

export async function getIntento(intentoId: string): Promise<IntentoDetail | null> {
  const supabase = await createClient();
  const { data: intento } = await supabase
    .from("aprendizaje_intentos")
    .select("id, curso_id, leccion_id, submitted_at, score, passed")
    .eq("id", intentoId)
    .maybeSingle();
  if (!intento) return null;
  const { data: preguntas, error } = await supabase.rpc("aprendizaje_preguntas_intento", { p_intento_id: intentoId });
  if (error) return null;
  return {
    id: intento.id,
    cursoId: intento.curso_id,
    leccionId: intento.leccion_id,
    submitted: intento.submitted_at !== null,
    score: intento.score,
    passed: intento.passed,
    preguntas: (preguntas ?? []) as PreguntaIntento[],
  };
}

export async function enviarIntento(
  intentoId: string,
  cursoId: string,
  answers: Record<string, string>,
): Promise<{ resultado?: IntentoResultado; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aprendizaje_enviar_intento", {
    p_intento_id: intentoId,
    p_answers: answers,
  });
  if (error) return { error: error.message };
  revalidatePath(`/aprendizaje/${cursoId}`);
  revalidatePath("/aprendizaje");
  const r = data as {
    score: number;
    passed: boolean;
    correct: number;
    total: number;
    nota_curso: number;
    curso_completado: boolean;
  };
  return {
    resultado: {
      score: r.score,
      passed: r.passed,
      correct: r.correct,
      total: r.total,
      notaCurso: r.nota_curso,
      cursoCompletado: r.curso_completado,
    },
  };
}

/** The banner's identity: the caller's own Agenda contact, matched by email. */
export async function getMiPerfil(): Promise<PerfilAprendizaje> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fallback: PerfilAprendizaje = { name: user?.email ?? "", position: null, department: null, photoUrl: null };
  if (!user?.email) return fallback;

  // Same lookup as planificacion's getMyContact: only the caller's own row, by their own email.
  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("first_name, last_name, position, photo_url, departments(name)")
    .eq("email", user.email)
    .maybeSingle();
  if (!contact) return fallback;
  const dept = Array.isArray(contact.departments) ? contact.departments[0] : contact.departments;
  return {
    name: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || user.email,
    position: contact.position || null,
    department: dept?.name ?? null,
    photoUrl: contact.photo_url || null,
  };
}

/**
 * Active tutorials of the modules the caller's role profile has. RLS on
 * aprendizaje_tutoriales does the module check (managers see every one, so
 * the inactive ones are filtered out here).
 */
export async function listTutoriales(): Promise<Tutorial[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("aprendizaje_tutoriales")
    .select("id, title, module_key, video_url, video_drive_id, video_item_id, imagen_drive_id, imagen_item_id, active, modules(label)")
    .eq("active", true)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as RawTutorial[]).map(toTutorial);
}

export async function listProximos(): Promise<ProximoCurso[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("aprendizaje_proximamente");
  return ((data ?? []) as { id: string; title: string; description: string | null; category: ProximoCurso["category"] }[]).map(
    (p) => ({ id: p.id, title: p.title, description: p.description, category: p.category }),
  );
}
