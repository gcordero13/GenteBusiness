import { notaCurso } from "./evaluacion";
import type {
  CatalogCurso,
  CursoCategory,
  CursoDetail,
  CursoStatus,
  DriveFileRef,
  GestionCursoRow,
  LeccionQuiz,
} from "./types";

// Row shapes as returned by Supabase's nested selects (snake_case).
export interface RawArchivo {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number | null;
  drive_id: string;
  item_id: string;
  position: number;
}

export interface RawLeccion {
  id: string;
  position: number;
  title: string;
  body: string | null;
  video_url: string | null;
  video_drive_id: string | null;
  video_item_id: string | null;
  eval_questions_per_attempt?: number | null;
  eval_weight?: number | null;
  aprendizaje_leccion_archivos?: RawArchivo[] | null;
}

export interface RawCurso {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
  status: CursoStatus;
  cover_drive_id: string | null;
  cover_item_id: string | null;
  updated_at?: string;
  eval_passing_score?: number | null;
  eval_max_attempts?: number | null;
  anunciar_proximamente?: boolean | null;
  tutorial_module_key?: string | null;
  anunciar_al_iniciar?: boolean | null;
  // The catalog/list queries only select lesson ids; the detail query selects everything.
  aprendizaje_lecciones?: (Pick<RawLeccion, "id"> & Partial<RawLeccion>)[] | null;
}

function fileRef(driveId: string | null, itemId: string | null): DriveFileRef | null {
  return driveId && itemId ? { driveId, itemId } : null;
}

export function toCursoDetail(
  raw: RawCurso,
  completedLeccionIds: ReadonlySet<string>,
  completedAt: string | null,
): CursoDetail {
  const lecciones = [...((raw.aprendizaje_lecciones ?? []) as RawLeccion[])]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      id: l.id,
      position: l.position,
      title: l.title,
      body: l.body,
      videoUrl: l.video_url,
      videoFile: fileRef(l.video_drive_id, l.video_item_id),
      archivos: [...(l.aprendizaje_leccion_archivos ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.content_type,
          sizeBytes: a.size_bytes,
          driveId: a.drive_id,
          itemId: a.item_id,
        })),
      completed: completedLeccionIds.has(l.id),
      quiz: toQuiz(l),
    }));

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    category: raw.category,
    status: raw.status,
    cover: fileRef(raw.cover_drive_id, raw.cover_item_id),
    lecciones,
    completedAt,
    evaluacion: {
      passingScore: raw.eval_passing_score ?? 70,
      maxAttempts: raw.eval_max_attempts ?? null,
    },
    anunciarProximamente: raw.anunciar_proximamente ?? false,
    tutorialModulo: raw.tutorial_module_key ?? null,
    anunciarAlIniciar: raw.anunciar_al_iniciar ?? false,
  };
}

function toQuiz(l: Partial<RawLeccion>): LeccionQuiz | null {
  return l.eval_questions_per_attempt != null
    ? {
        questionsPerAttempt: l.eval_questions_per_attempt,
        weight: l.eval_weight ?? 0,
      }
    : null;
}

export function toCatalogCurso(
  raw: RawCurso,
  completedLeccionIds: ReadonlySet<string>,
  inscripcion: { completedAt: string | null } | null,
  bestScoreByLeccion: ReadonlyMap<string, number> = new Map(),
): CatalogCurso {
  const lecciones = (raw.aprendizaje_lecciones ?? []).map((l) => ({ id: l.id, quiz: toQuiz(l) }));
  const leccionIds = lecciones.map((l) => l.id);
  const hasEvaluacion = lecciones.some((l) => l.quiz !== null);
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    category: raw.category,
    cover: fileRef(raw.cover_drive_id, raw.cover_item_id),
    leccionCount: leccionIds.length,
    completedLecciones: leccionIds.filter((id) => completedLeccionIds.has(id)).length,
    completedAt: inscripcion?.completedAt ?? null,
    enrolled: inscripcion !== null,
    hasEvaluacion,
    nota: hasEvaluacion && inscripcion !== null ? notaCurso(lecciones, bestScoreByLeccion) : null,
  };
}

export function toGestionCursoRow(raw: RawCurso): GestionCursoRow {
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    status: raw.status,
    leccionCount: (raw.aprendizaje_lecciones ?? []).length,
    updatedAt: raw.updated_at ?? "",
  };
}

export function progressPercent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.round((done / total) * 100);
}

export function firstPendingLeccionId(lecciones: { id: string; completed: boolean }[]): string | null {
  return (lecciones.find((l) => !l.completed) ?? lecciones[0])?.id ?? null;
}

export function nextLeccionId(lecciones: { id: string }[], currentId: string): string | null {
  const index = lecciones.findIndex((l) => l.id === currentId);
  return index >= 0 && index < lecciones.length - 1 ? lecciones[index + 1].id : null;
}
