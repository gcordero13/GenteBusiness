import { describe, expect, it } from "vitest";
import {
  evaluacionDisponibilidad,
  summarizeIntentos,
  toPreguntaGestion,
  validateEvalSettings,
  validatePregunta,
  type PreguntaInput,
} from "./evaluacion";

const opcionUnica = (overrides: Partial<PreguntaInput> = {}): PreguntaInput => ({
  text: "¿Capital de RD?",
  type: "opcion_unica",
  options: [
    { text: "Santo Domingo", isCorrect: true },
    { text: "Santiago", isCorrect: false },
  ],
  ...overrides,
});

describe("validatePregunta", () => {
  it("accepts a valid single-choice and true/false question", () => {
    expect(validatePregunta(opcionUnica())).toBeNull();
    expect(
      validatePregunta({
        text: "El sol es una estrella",
        type: "verdadero_falso",
        options: [
          { text: "Verdadero", isCorrect: true },
          { text: "Falso", isCorrect: false },
        ],
      }),
    ).toBeNull();
  });

  it.each<[string, PreguntaInput, string]>([
    ["empty text", opcionUnica({ text: "  " }), "Escribe la pregunta."],
    ["one option", opcionUnica({ options: [{ text: "A", isCorrect: true }] }), "Agrega al menos dos opciones."],
    [
      "an empty option",
      opcionUnica({ options: [{ text: "A", isCorrect: true }, { text: " ", isCorrect: false }] }),
      "Las opciones no pueden estar vacías.",
    ],
    [
      "no correct option",
      opcionUnica({ options: [{ text: "A", isCorrect: false }, { text: "B", isCorrect: false }] }),
      "Marca exactamente una opción correcta.",
    ],
    [
      "two correct options",
      opcionUnica({ options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }] }),
      "Marca exactamente una opción correcta.",
    ],
    [
      "true/false without an answer",
      {
        text: "X",
        type: "verdadero_falso",
        options: [
          { text: "Verdadero", isCorrect: false },
          { text: "Falso", isCorrect: false },
        ],
      },
      "Marca si la respuesta correcta es Verdadero o Falso.",
    ],
  ])("rejects %s", (_label, input, error) => {
    expect(validatePregunta(input)).toBe(error);
  });
});

describe("validateEvalSettings", () => {
  it("accepts valid settings, including no evaluation and unlimited attempts", () => {
    expect(validateEvalSettings({ questionsPerAttempt: 10, passingScore: 70, maxAttempts: 3 })).toBeNull();
    expect(validateEvalSettings({ questionsPerAttempt: null, passingScore: 70, maxAttempts: null })).toBeNull();
  });

  it.each<[Parameters<typeof validateEvalSettings>[0], string]>([
    [{ questionsPerAttempt: 0, passingScore: 70, maxAttempts: null }, "Las preguntas por persona deben ser un número mayor a 0."],
    [{ questionsPerAttempt: 2.5, passingScore: 70, maxAttempts: null }, "Las preguntas por persona deben ser un número mayor a 0."],
    [{ questionsPerAttempt: 5, passingScore: 0, maxAttempts: null }, "La nota mínima debe estar entre 1 y 100."],
    [{ questionsPerAttempt: 5, passingScore: 101, maxAttempts: null }, "La nota mínima debe estar entre 1 y 100."],
    [
      { questionsPerAttempt: 5, passingScore: 70, maxAttempts: 0 },
      "Los intentos deben ser un número mayor a 0 (o vacío para ilimitados).",
    ],
  ])("rejects %j", (settings, error) => {
    expect(validateEvalSettings(settings)).toBe(error);
  });
});

describe("summarizeIntentos", () => {
  it("counts attempts, finds the open one, the best score and whether any passed", () => {
    expect(
      summarizeIntentos([
        { id: "a", submitted_at: "2026-11-25T10:00:00Z", score: 40, passed: false },
        { id: "b", submitted_at: "2026-11-25T11:00:00Z", score: 80, passed: true },
        { id: "c", submitted_at: null, score: null, passed: null },
      ]),
    ).toEqual({ attemptsUsed: 3, passed: true, bestScore: 80, openIntentoId: "c" });
    expect(summarizeIntentos([])).toEqual({ attemptsUsed: 0, passed: false, bestScore: null, openIntentoId: null });
  });
});

describe("evaluacionDisponibilidad", () => {
  const settings = { questionsPerAttempt: 5, passingScore: 70, maxAttempts: 2 };
  const fresh = { attemptsUsed: 0, passed: false, bestScore: null, openIntentoId: null };

  it("offers the first attempt once lessons are done", () => {
    expect(evaluacionDisponibilidad(settings, fresh, true)).toEqual({ canStart: true, label: "Tomar evaluación", reason: null });
  });

  it("requires all lessons first", () => {
    expect(evaluacionDisponibilidad(settings, fresh, false)).toMatchObject({
      canStart: false,
      reason: "Completa todas las lecciones para habilitar la evaluación.",
    });
  });

  it("resumes an open attempt", () => {
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 1, openIntentoId: "x" }, true)).toMatchObject({
      canStart: true,
      label: "Continuar evaluación",
    });
  });

  it("offers a retry until attempts run out", () => {
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 1, bestScore: 40 }, true)).toMatchObject({
      canStart: true,
      label: "Intentar de nuevo",
    });
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 2, bestScore: 40 }, true)).toMatchObject({
      canStart: false,
      reason: "Usaste todos tus intentos. Consulta con el área responsable.",
    });
    expect(
      evaluacionDisponibilidad({ ...settings, maxAttempts: null }, { ...fresh, attemptsUsed: 9 }, true).canStart,
    ).toBe(true);
  });

  it("stops once passed", () => {
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 1, passed: true, bestScore: 90 }, true)).toMatchObject({
      canStart: false,
      reason: "Aprobaste la evaluación.",
    });
  });
});

describe("toPreguntaGestion", () => {
  it("maps and sorts options by position", () => {
    expect(
      toPreguntaGestion({
        id: "p1",
        text: "¿?",
        type: "opcion_unica",
        active: true,
        aprendizaje_opciones: [
          { id: "o2", text: "B", is_correct: false, position: 1 },
          { id: "o1", text: "A", is_correct: true, position: 0 },
        ],
      }),
    ).toEqual({
      id: "p1",
      text: "¿?",
      type: "opcion_unica",
      active: true,
      options: [
        { id: "o1", text: "A", isCorrect: true },
        { id: "o2", text: "B", isCorrect: false },
      ],
    });
  });
});
