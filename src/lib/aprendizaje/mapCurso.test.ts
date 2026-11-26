import { describe, expect, it } from "vitest";
import {
  firstPendingLeccionId,
  nextLeccionId,
  progressPercent,
  toCatalogCurso,
  toCursoDetail,
  toGestionCursoRow,
  type RawCurso,
} from "./mapCurso";

const RAW: RawCurso = {
  id: "c1",
  title: "Seguridad",
  description: "Curso básico",
  category: "curso",
  status: "publicado",
  cover_drive_id: "d1",
  cover_item_id: "i1",
  updated_at: "2026-11-25T10:00:00Z",
  aprendizaje_lecciones: [
    {
      id: "l2",
      position: 1,
      title: "Segunda",
      body: null,
      video_url: null,
      video_drive_id: "d2",
      video_item_id: "i2",
      aprendizaje_leccion_archivos: [
        { id: "a2", filename: "b.pdf", content_type: "application/pdf", size_bytes: 20, drive_id: "d", item_id: "b", position: 1 },
        { id: "a1", filename: "a.pdf", content_type: "application/pdf", size_bytes: 10, drive_id: "d", item_id: "a", position: 0 },
      ],
    },
    {
      id: "l1",
      position: 0,
      title: "Primera",
      body: "Hola",
      video_url: "https://youtu.be/abc123def45",
      video_drive_id: null,
      video_item_id: null,
      aprendizaje_leccion_archivos: null,
    },
  ],
};

describe("toCursoDetail", () => {
  it("sorts lessons and files by position and marks completed lessons", () => {
    const curso = toCursoDetail(RAW, new Set(["l1"]), null);

    expect(curso.cover).toEqual({ driveId: "d1", itemId: "i1" });
    expect(curso.lecciones.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(curso.lecciones[0]).toMatchObject({ completed: true, videoUrl: "https://youtu.be/abc123def45", videoFile: null, archivos: [] });
    expect(curso.lecciones[1].videoFile).toEqual({ driveId: "d2", itemId: "i2" });
    expect(curso.lecciones[1].archivos.map((a) => a.filename)).toEqual(["a.pdf", "b.pdf"]);
    expect(curso.lecciones[1].completed).toBe(false);
  });

  it("returns no cover when the ids are missing", () => {
    expect(toCursoDetail({ ...RAW, cover_drive_id: null, cover_item_id: null }, new Set(), null).cover).toBeNull();
  });

  it("maps the evaluation settings, defaulting to no evaluation", () => {
    expect(toCursoDetail(RAW, new Set(), null).evaluacion).toEqual({
      questionsPerAttempt: null,
      passingScore: 70,
      maxAttempts: null,
    });
    expect(
      toCursoDetail({ ...RAW, eval_questions_per_attempt: 10, eval_passing_score: 80, eval_max_attempts: 3 }, new Set(), null)
        .evaluacion,
    ).toEqual({ questionsPerAttempt: 10, passingScore: 80, maxAttempts: 3 });
  });

  it("maps the Próximamente flag", () => {
    expect(toCursoDetail(RAW, new Set(), null).anunciarProximamente).toBe(false);
    expect(toCursoDetail({ ...RAW, anunciar_proximamente: true }, new Set(), null).anunciarProximamente).toBe(true);
  });
});

describe("toCatalogCurso", () => {
  it("counts lessons, completed lessons and carries enrollment, evaluation and best score", () => {
    expect(
      toCatalogCurso(
        { ...RAW, eval_questions_per_attempt: 5 },
        new Set(["l2", "other"]),
        { completedAt: "2026-11-25T12:00:00Z" },
        90,
      ),
    ).toMatchObject({
      leccionCount: 2,
      completedLecciones: 1,
      completedAt: "2026-11-25T12:00:00Z",
      enrolled: true,
      hasEvaluacion: true,
      bestScore: 90,
    });
  });

  it("marks a course never started as not enrolled", () => {
    expect(toCatalogCurso(RAW, new Set(), null)).toMatchObject({
      enrolled: false,
      completedAt: null,
      hasEvaluacion: false,
      bestScore: null,
    });
  });
});

describe("toGestionCursoRow", () => {
  it("maps status, lesson count and updatedAt", () => {
    expect(toGestionCursoRow(RAW)).toEqual({
      id: "c1",
      title: "Seguridad",
      category: "curso",
      status: "publicado",
      leccionCount: 2,
      updatedAt: "2026-11-25T10:00:00Z",
    });
  });
});

describe("progress helpers", () => {
  it("progressPercent rounds and handles empty courses", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(3, 3)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });

  const lecciones = [
    { id: "a", completed: true },
    { id: "b", completed: false },
    { id: "c", completed: false },
  ];

  it("firstPendingLeccionId picks the first incomplete lesson, else the first one", () => {
    expect(firstPendingLeccionId(lecciones)).toBe("b");
    expect(firstPendingLeccionId(lecciones.map((l) => ({ ...l, completed: true })))).toBe("a");
    expect(firstPendingLeccionId([])).toBeNull();
  });

  it("nextLeccionId returns the following lesson or null at the end", () => {
    expect(nextLeccionId(lecciones, "a")).toBe("b");
    expect(nextLeccionId(lecciones, "c")).toBeNull();
    expect(nextLeccionId(lecciones, "missing")).toBeNull();
  });
});
