import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";

const marcarLeccionVista = vi.fn();
const iniciarIntento = vi.fn();
const refresh = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("../actions", () => ({
  marcarLeccionVista: (leccionId: string, cursoId: string) => marcarLeccionVista(leccionId, cursoId),
  iniciarIntento: (cursoId: string) => iniciarIntento(cursoId),
}));

const { CursoViewer } = await import("./CursoViewer");

function leccion(id: string, title: string, completed: boolean) {
  return { id, position: 0, title, body: `Contenido de ${title}`, videoUrl: null, videoFile: null, archivos: [], completed };
}

const CURSO: CursoDetail = {
  id: "c1",
  title: "Seguridad industrial",
  description: null,
  category: "curso",
  status: "publicado",
  cover: null,
  completedAt: null,
  evaluacion: { questionsPerAttempt: null, passingScore: 70, maxAttempts: null },
  lecciones: [leccion("l1", "Introducción", true), leccion("l2", "Equipos de protección", false), leccion("l3", "Cierre", false)],
};

describe("CursoViewer", () => {
  beforeEach(() => {
    marcarLeccionVista.mockReset();
    refresh.mockReset();
  });

  it("opens the first pending lesson and shows overall progress", () => {
    render(<CursoViewer curso={CURSO} />);
    expect(screen.getByRole("heading", { name: "Equipos de protección" })).toBeTruthy();
    expect(screen.getByText("1 de 3 lecciones vistas")).toBeTruthy();
  });

  it("marks the lesson as seen and moves to the next one", async () => {
    marcarLeccionVista.mockResolvedValue({});
    render(<CursoViewer curso={CURSO} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como vista" }));

    await waitFor(() => expect(marcarLeccionVista).toHaveBeenCalledWith("l2", "c1"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Cierre" })).toBeTruthy());
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the error when marking fails", async () => {
    marcarLeccionVista.mockResolvedValue({ error: "El curso no está publicado" });
    render(<CursoViewer curso={CURSO} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como vista" }));

    await waitFor(() => expect(screen.getByText("El curso no está publicado")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Equipos de protección" })).toBeTruthy();
  });

  it("does not offer marking a lesson already seen", () => {
    render(<CursoViewer curso={CURSO} />);
    fireEvent.click(screen.getByRole("button", { name: /Introducción/ }));
    expect(screen.queryByRole("button", { name: "Marcar como vista" })).toBeNull();
    expect(screen.getByText("Lección vista")).toBeTruthy();
  });

  it("shows a preview banner and no mark button for a draft course", () => {
    render(<CursoViewer curso={{ ...CURSO, status: "borrador" }} />);
    expect(screen.getByText(/Vista previa/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar como vista" })).toBeNull();
  });

  it("celebrates a completed course", () => {
    render(<CursoViewer curso={{ ...CURSO, completedAt: "2026-11-25T12:00:00Z" }} />);
    expect(screen.getByText("¡Completaste este curso!")).toBeTruthy();
  });

  describe("evaluation", () => {
    const withEval: CursoDetail = { ...CURSO, evaluacion: { questionsPerAttempt: 5, passingScore: 70, maxAttempts: 2 } };
    const estado = { attemptsUsed: 0, passed: false, bestScore: null, openIntentoId: null };
    const allSeen: CursoDetail = { ...withEval, lecciones: withEval.lecciones.map((l) => ({ ...l, completed: true })) };

    it("asks to finish the lessons first", () => {
      render(<CursoViewer curso={withEval} evaluacion={estado} />);
      expect(screen.getByText("Evaluación final")).toBeTruthy();
      expect(screen.getByText("Completa todas las lecciones para habilitar la evaluación.")).toBeTruthy();
    });

    it("starts an attempt and opens it", async () => {
      iniciarIntento.mockResolvedValue({ intentoId: "i1" });
      render(<CursoViewer curso={allSeen} evaluacion={estado} />);

      fireEvent.click(screen.getByRole("button", { name: "Tomar evaluación" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/aprendizaje/c1/evaluacion/i1"));
      expect(iniciarIntento).toHaveBeenCalledWith("c1");
    });

    it("hides the card when the course has no evaluation", () => {
      render(<CursoViewer curso={CURSO} evaluacion={null} />);
      expect(screen.queryByText("Evaluación final")).toBeNull();
    });
  });
});
