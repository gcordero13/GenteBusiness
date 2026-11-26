import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";
import { CursoPortada } from "./CursoPortada";

function leccion(id: string, title: string, completed: boolean, body: string | null = null) {
  return { id, position: 0, title, body, videoUrl: null, videoFile: null, archivos: [], completed, quiz: null };
}

const CURSO: CursoDetail = {
  id: "c1",
  title: "Seguridad industrial",
  description: "Lo básico para trabajar seguro",
  category: "curso",
  status: "publicado",
  cover: null,
  completedAt: null,
  evaluacion: { passingScore: 70, maxAttempts: null },
  anunciarProximamente: false,
  tutorialModulo: null,
  anunciarAlIniciar: false,
  firma: { nombre: null, cargo: null, imagen: null },
  lecciones: [
    { ...leccion("l1", "Introducción", true, "Qué veremos en el curso\ny por qué importa."), videoUrl: "https://youtu.be/abc" },
    { ...leccion("l2", "Equipos de protección", false), quiz: { questionsPerAttempt: 5, weight: 60 } },
    { ...leccion("l3", "Cierre", false), quiz: { questionsPerAttempt: 3, weight: 40 } },
  ],
};

const ESTADO_L2 = { l2: { attemptsUsed: 1, passed: true, bestScore: 80, openIntentoId: null } };

describe("CursoPortada", () => {
  it("presents the course with a button to continue where the person left off", () => {
    render(<CursoPortada curso={CURSO} />);
    expect(screen.getByRole("heading", { name: "Seguridad industrial" })).toBeTruthy();
    expect(screen.getByText("Lo básico para trabajar seguro")).toBeTruthy();
    expect(screen.getByText("3 clases · 2 cuestionarios")).toBeTruthy();
    expect(screen.getByText("1 de 3 clases vistas · 33%")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Continuar: Clase 2/ }).getAttribute("href")).toBe("/aprendizaje/c1?leccion=l2");
  });

  it("says 'Comenzar curso' when nothing has been seen", () => {
    render(<CursoPortada curso={{ ...CURSO, lecciones: CURSO.lecciones.map((l) => ({ ...l, completed: false })) }} />);
    expect(screen.getByRole("link", { name: /Comenzar curso/ }).getAttribute("href")).toBe("/aprendizaje/c1?leccion=l1");
  });

  it("lists every class with what it's about, its video and its quiz", () => {
    render(<CursoPortada curso={CURSO} cuestionarios={ESTADO_L2} />);
    const intro = screen.getByRole("link", { name: /Introducción/ });
    expect(intro.getAttribute("href")).toBe("/aprendizaje/c1?leccion=l1");
    expect(intro.textContent).toContain("Qué veremos en el curso y por qué importa.");
    expect(intro.textContent).toContain("Video");
    expect(screen.getByRole("link", { name: /Equipos de protección/ }).textContent).toContain(
      "Cuestionario · 60% · tu nota 80%",
    );
  });

  it("shows the course grade against the minimum here, before the videos", () => {
    render(<CursoPortada curso={CURSO} cuestionarios={ESTADO_L2} />);
    // 60% × 80 = 48
    expect(screen.getByText("48%")).toBeTruthy();
    expect(screen.getByText(/mínima para aprobar 70%/)).toBeTruthy();
    expect(screen.getByText("Te faltan 2 cuestionarios por responder.")).toBeTruthy();
  });

  it("hides the course grade when no class has a quiz", () => {
    render(<CursoPortada curso={{ ...CURSO, lecciones: CURSO.lecciones.map((l) => ({ ...l, quiz: null })) }} />);
    expect(screen.queryByLabelText("Nota del curso")).toBeNull();
  });

  it("celebrates a completed course and offers to review it", () => {
    render(<CursoPortada curso={{ ...CURSO, completedAt: "2026-11-25T12:00:00Z" }} />);
    expect(screen.getByText("¡Completaste este curso!")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Repasar el curso/ })).toBeTruthy();
  });

  it("shows a preview banner for a draft and no progress", () => {
    render(<CursoPortada curso={{ ...CURSO, status: "borrador" }} />);
    expect(screen.getByText(/Vista previa/)).toBeTruthy();
    expect(screen.queryByText(/clases vistas/)).toBeNull();
    expect(screen.queryByLabelText("Nota del curso")).toBeNull();
  });
});
