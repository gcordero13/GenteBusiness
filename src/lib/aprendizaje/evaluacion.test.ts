import { describe, expect, it } from "vitest";
import {
  notaCurso,
  pesoTotal,
  quizDisponibilidad,
  summarizeIntentos,
  summarizeIntentosPorLeccion,
  toPreguntaGestion,
  validateEvalSettings,
  validatePregunta,
  validateQuiz,
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
  it("accepts a passing score and limited or unlimited attempts", () => {
    expect(validateEvalSettings({ passingScore: 70, maxAttempts: 3 })).toBeNull();
    expect(validateEvalSettings({ passingScore: 70, maxAttempts: null })).toBeNull();
  });

  it.each<[Parameters<typeof validateEvalSettings>[0], string]>([
    [{ passingScore: 0, maxAttempts: null }, "La nota mínima debe estar entre 1 y 100."],
    [{ passingScore: 101, maxAttempts: null }, "La nota mínima debe estar entre 1 y 100."],
    [{ passingScore: 70, maxAttempts: 0 }, "Los intentos deben ser un número mayor a 0 (o vacío para ilimitados)."],
  ])("rejects %j", (settings, error) => {
    expect(validateEvalSettings(settings)).toBe(error);
  });
});

describe("validateQuiz", () => {
  it("accepts a quiz with questions per person and a weight", () => {
    expect(validateQuiz({ questionsPerAttempt: 5, weight: 30 })).toBeNull();
  });

  it.each<[Parameters<typeof validateQuiz>[0], string]>([
    [{ questionsPerAttempt: 0, weight: 30 }, "Las preguntas por persona deben ser un número mayor a 0."],
    [{ questionsPerAttempt: 1.5, weight: 30 }, "Las preguntas por persona deben ser un número mayor a 0."],
    [{ questionsPerAttempt: 5, weight: 0 }, "El peso debe ser un número entre 1 y 100."],
    [{ questionsPerAttempt: 5, weight: 101 }, "El peso debe ser un número entre 1 y 100."],
  ])("rejects %j", (quiz, error) => {
    expect(validateQuiz(quiz)).toBe(error);
  });
});

describe("course grade", () => {
  const lecciones = [
    { id: "l1", quiz: { questionsPerAttempt: 5, weight: 30 } },
    { id: "l2", quiz: { questionsPerAttempt: 5, weight: 40 } },
    { id: "l3", quiz: null },
    { id: "l4", quiz: { questionsPerAttempt: 5, weight: 30 } },
  ];

  it("sums only the quiz lessons' weights", () => {
    expect(pesoTotal(lecciones)).toBe(100);
    expect(pesoTotal([{ id: "x", quiz: null }])).toBe(0);
  });

  it("weights each lesson's best score (the worked example: 30×80 + 40×100 + 30×50 = 79)", () => {
    expect(notaCurso(lecciones, new Map([["l1", 80], ["l2", 100], ["l4", 50]]))).toBe(79);
  });

  it("counts unanswered quizzes as 0 and floors the result", () => {
    expect(notaCurso(lecciones, new Map([["l1", 85]]))).toBe(25);
    expect(notaCurso(lecciones, new Map())).toBe(0);
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

  it("groups by lesson, ignoring old course-level attempts", () => {
    const porLeccion = summarizeIntentosPorLeccion([
      { id: "a", leccion_id: "l1", submitted_at: "2026-11-25T10:00:00Z", score: 40, passed: false },
      { id: "b", leccion_id: "l1", submitted_at: "2026-11-25T11:00:00Z", score: 90, passed: true },
      { id: "c", leccion_id: "l2", submitted_at: null, score: null, passed: null },
      { id: "d", leccion_id: null, submitted_at: "2026-11-24T10:00:00Z", score: 100, passed: true },
    ]);
    expect(porLeccion.get("l1")).toMatchObject({ attemptsUsed: 2, bestScore: 90 });
    expect(porLeccion.get("l2")).toMatchObject({ attemptsUsed: 1, openIntentoId: "c" });
    expect(porLeccion.size).toBe(2);
  });
});

describe("quizDisponibilidad", () => {
  const settings = { passingScore: 70, maxAttempts: 2 };
  const fresh = { attemptsUsed: 0, passed: false, bestScore: null, openIntentoId: null };

  it("offers the first attempt", () => {
    expect(quizDisponibilidad(settings, fresh)).toEqual({ canStart: true, label: "Responder cuestionario", reason: null });
  });

  it("resumes an open attempt", () => {
    expect(quizDisponibilidad(settings, { ...fresh, attemptsUsed: 1, openIntentoId: "x" })).toMatchObject({
      canStart: true,
      label: "Continuar cuestionario",
    });
  });

  it("offers a retry until attempts run out", () => {
    expect(quizDisponibilidad(settings, { ...fresh, attemptsUsed: 1, bestScore: 40 })).toMatchObject({
      canStart: true,
      label: "Repetir cuestionario",
    });
    expect(quizDisponibilidad(settings, { ...fresh, attemptsUsed: 2, bestScore: 40 })).toMatchObject({
      canStart: false,
      reason: "Usaste todos tus intentos de este cuestionario.",
    });
    expect(quizDisponibilidad({ ...settings, maxAttempts: null }, { ...fresh, attemptsUsed: 9 }).canStart).toBe(true);
  });

  // A course completed before its quiz existed (or completed with a low
  // quiz score) must still let the person answer: the grade can only go up.
  it("still offers the quiz when the course is already completed", () => {
    expect(quizDisponibilidad(settings, fresh)).toMatchObject({ canStart: true, label: "Responder cuestionario" });
    expect(quizDisponibilidad(settings, { ...fresh, attemptsUsed: 1, bestScore: 90 })).toMatchObject({
      canStart: true,
      label: "Repetir cuestionario",
    });
  });

  it("always explains why the quiz can't start", () => {
    const { canStart, reason } = quizDisponibilidad(settings, { ...fresh, attemptsUsed: 2, bestScore: 40 });
    expect(canStart).toBe(false);
    expect(reason).toBe("Usaste todos tus intentos de este cuestionario.");
  });
});

describe("toPreguntaGestion", () => {
  it("maps the lesson and sorts options by position", () => {
    expect(
      toPreguntaGestion({
        id: "p1",
        leccion_id: "l1",
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
      leccionId: "l1",
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
