import type { EvalSettings } from "./types";

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
  options: OpcionInput[];
}

/** A bank question as the manager sees it (with the correct answer). */
export interface PreguntaGestion {
  id: string;
  text: string;
  type: PreguntaType;
  active: boolean;
  options: { id: string; text: string; isCorrect: boolean }[];
}

/** A drawn question as the learner sees it (never includes the answer). */
export interface PreguntaIntento {
  id: string;
  text: string;
  type: PreguntaType;
  options: { id: string; text: string }[];
}

export interface IntentoResultado {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
}

export interface IntentoDetail {
  id: string;
  cursoId: string;
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
  text: string;
  type: PreguntaType;
  active: boolean;
  aprendizaje_opciones?: { id: string; text: string; is_correct: boolean; position: number }[] | null;
}

export function validatePregunta(input: PreguntaInput): string | null {
  if (!input.text.trim()) return "Escribe la pregunta.";
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
  if (settings.questionsPerAttempt !== null && !isPositiveInt(settings.questionsPerAttempt)) {
    return "Las preguntas por persona deben ser un número mayor a 0.";
  }
  if (!Number.isInteger(settings.passingScore) || settings.passingScore < 1 || settings.passingScore > 100) {
    return "La nota mínima debe estar entre 1 y 100.";
  }
  if (settings.maxAttempts !== null && !isPositiveInt(settings.maxAttempts)) {
    return "Los intentos deben ser un número mayor a 0 (o vacío para ilimitados).";
  }
  return null;
}

export function summarizeIntentos(
  rows: { id: string; submitted_at: string | null; score: number | null; passed: boolean | null }[],
): EvaluacionEstado {
  const submitted = rows.filter((r) => r.submitted_at !== null);
  const scores = submitted.map((r) => r.score ?? 0);
  return {
    attemptsUsed: rows.length,
    passed: submitted.some((r) => r.passed === true),
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    openIntentoId: rows.find((r) => r.submitted_at === null)?.id ?? null,
  };
}

/** Mirrors the checks in aprendizaje_iniciar_intento so the UI explains why it can't start. */
export function evaluacionDisponibilidad(
  settings: EvalSettings,
  estado: EvaluacionEstado,
  lessonsDone: boolean,
): { canStart: boolean; label: string; reason: string | null } {
  if (estado.passed) return { canStart: false, label: "", reason: "Aprobaste la evaluación." };
  if (estado.openIntentoId) return { canStart: true, label: "Continuar evaluación", reason: null };
  if (!lessonsDone) {
    return { canStart: false, label: "", reason: "Completa todas las lecciones para habilitar la evaluación." };
  }
  if (settings.maxAttempts !== null && estado.attemptsUsed >= settings.maxAttempts) {
    return { canStart: false, label: "", reason: "Usaste todos tus intentos. Consulta con el área responsable." };
  }
  return { canStart: true, label: estado.attemptsUsed > 0 ? "Intentar de nuevo" : "Tomar evaluación", reason: null };
}

export function toPreguntaGestion(raw: RawPregunta): PreguntaGestion {
  return {
    id: raw.id,
    text: raw.text,
    type: raw.type,
    active: raw.active,
    options: [...(raw.aprendizaje_opciones ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })),
  };
}
