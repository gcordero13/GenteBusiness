import type { EvalSettings, LeccionQuiz } from "./types";

export type PreguntaType = "opcion_unica" | "verdadero_falso";

export const PREGUNTA_TYPE_LABELS: Record<PreguntaType, string> = {
  opcion_unica: "Selección múltiple",
  verdadero_falso: "Verdadero o falso",
};

export const TRUE_FALSE_TEXTS = ["Verdadero", "Falso"] as const;

export interface OpcionInput {
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface PreguntaInput {
  id?: string;
  text: string;
  type: PreguntaType;
  /** Seconds to answer it; null = no time limit. */
  seconds: number | null;
  options: OpcionInput[];
}


/** A bank question as the manager sees it (with the correct answer). */
export interface PreguntaGestion {
  id: string;
  /** The lesson whose quiz it belongs to (null only for leftovers from course-level evaluations). */
  leccionId: string | null;
  text: string;
  type: PreguntaType;
  active: boolean;
  /** Seconds to answer it; null = no time limit. */
  seconds: number | null;
  options: { id: string; text: string; isCorrect: boolean }[];
}

/** A drawn question as the learner sees it (never includes the answer). */
export interface PreguntaIntento {
  id: string;
  text: string;
  type: PreguntaType;
  /** Seconds to answer it; null/absent = no time limit. */
  seconds?: number | null;
  options: { id: string; text: string }[];
}

export interface IntentoResultado {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  /** The course grade after this attempt. */
  notaCurso: number;
  cursoCompletado: boolean;
}

export interface IntentoDetail {
  id: string;
  cursoId: string;
  leccionId: string | null;
  submitted: boolean;
  score: number | null;
  passed: boolean | null;
  preguntas: PreguntaIntento[];
}

export interface EvaluacionEstado {
  attemptsUsed: number;
  passed: boolean;
  bestScore: number | null;
  openIntentoId: string | null;
}

export interface RawPregunta {
  id: string;
  leccion_id?: string | null;
  text: string;
  type: PreguntaType;
  active: boolean;
  seconds?: number | null;
  aprendizaje_opciones?: { id: string; text: string; is_correct: boolean; position: number }[] | null;
}

type IntentoRow = { id: string; submitted_at: string | null; score: number | null; passed: boolean | null };

export function validatePregunta(input: PreguntaInput): string | null {
  if (!input.text.trim()) return "Escribe la pregunta.";
  if (input.seconds !== null && (!Number.isInteger(input.seconds) || input.seconds < 5 || input.seconds > 600)) {
    return "El tiempo debe ser de 5 a 600 segundos (o vacío para sin límite).";
  }
  const correct = input.options.filter((o) => o.isCorrect).length;
  if (input.type === "verdadero_falso") {
    return input.options.length === 2 && correct === 1 ? null : "Marca si la respuesta correcta es Verdadero o Falso.";
  }
  if (input.options.length < 2) return "Agrega al menos dos opciones.";
  if (input.options.some((o) => !o.text.trim())) return "Las opciones no pueden estar vacías.";
  if (correct !== 1) return "Marca exactamente una opción correcta.";
  return null;
}

const isPositiveInt = (n: number) => Number.isInteger(n) && n > 0;

export function validateEvalSettings(settings: EvalSettings): string | null {
  if (!Number.isInteger(settings.passingScore) || settings.passingScore < 1 || settings.passingScore > 100) {
    return "La nota mínima debe estar entre 1 y 100.";
  }
  if (settings.maxAttempts !== null && !isPositiveInt(settings.maxAttempts)) {
    return "Los intentos deben ser un número mayor a 0 (o vacío para ilimitados).";
  }
  return null;
}

export function validateQuiz(quiz: LeccionQuiz): string | null {
  if (!isPositiveInt(quiz.questionsPerAttempt)) return "Las preguntas por persona deben ser un número mayor a 0.";
  if (!Number.isInteger(quiz.weight) || quiz.weight < 1 || quiz.weight > 100) return "El peso debe ser un número entre 1 y 100.";
  return null;
}

/** Sum of the quiz lessons' weights; must be exactly 100 to publish. */
export function pesoTotal<T extends { quiz: LeccionQuiz | null }>(lecciones: T[]): number {
  return lecciones.reduce((sum, l) => sum + (l.quiz?.weight ?? 0), 0);
}

/**
 * Course grade = floor(sum(weight × best lesson score) / 100). Mirrors
 * aprendizaje_nota_curso in the database, which is what decides completion.
 */
export function notaCurso(
  lecciones: { id: string; quiz: LeccionQuiz | null }[],
  bestScoreByLeccion: ReadonlyMap<string, number>,
): number {
  const weighted = lecciones.reduce(
    (sum, l) => sum + (l.quiz ? l.quiz.weight * (bestScoreByLeccion.get(l.id) ?? 0) : 0),
    0,
  );
  return Math.floor(weighted / 100);
}

export function summarizeIntentos(rows: IntentoRow[]): EvaluacionEstado {
  const submitted = rows.filter((r) => r.submitted_at !== null);
  const scores = submitted.map((r) => r.score ?? 0);
  return {
    attemptsUsed: rows.length,
    passed: submitted.some((r) => r.passed === true),
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    openIntentoId: rows.find((r) => r.submitted_at === null)?.id ?? null,
  };
}

/** One summary per lesson quiz; attempts from the old course-level evaluation (no lesson) are ignored. */
export function summarizeIntentosPorLeccion(
  rows: (IntentoRow & { leccion_id: string | null })[],
): Map<string, EvaluacionEstado> {
  const groups = new Map<string, IntentoRow[]>();
  for (const row of rows) {
    if (!row.leccion_id) continue;
    groups.set(row.leccion_id, [...(groups.get(row.leccion_id) ?? []), row]);
  }
  return new Map([...groups].map(([leccionId, group]) => [leccionId, summarizeIntentos(group)]));
}

/**
 * Mirrors the checks in aprendizaje_iniciar_cuestionario so the UI explains
 * why it can't start. A completed course does NOT block it: someone who
 * finished before the quiz existed must still be able to answer it.
 */
export function quizDisponibilidad(
  settings: EvalSettings,
  estado: EvaluacionEstado,
): { canStart: boolean; label: string; reason: string | null } {
  if (estado.openIntentoId) return { canStart: true, label: "Continuar cuestionario", reason: null };
  if (settings.maxAttempts !== null && estado.attemptsUsed >= settings.maxAttempts) {
    return { canStart: false, label: "", reason: "Usaste todos tus intentos de este cuestionario." };
  }
  return {
    canStart: true,
    label: estado.attemptsUsed > 0 ? "Repetir cuestionario" : "Responder cuestionario",
    reason: null,
  };
}

export function toPreguntaGestion(raw: RawPregunta): PreguntaGestion {
  return {
    id: raw.id,
    leccionId: raw.leccion_id ?? null,
    text: raw.text,
    type: raw.type,
    active: raw.active,
    seconds: raw.seconds ?? null,
    options: [...(raw.aprendizaje_opciones ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })),
  };
}
