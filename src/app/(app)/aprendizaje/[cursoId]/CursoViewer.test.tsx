import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";

const marcarLeccionVista = vi.fn();
const iniciarCuestionario = vi.fn();
const refresh = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("../actions", () => ({
  marcarLeccionVista: (leccionId: string, cursoId: string) => marcarLeccionVista(leccionId, cursoId),
  iniciarCuestionario: (leccionId: string, cursoId: string) => iniciarCuestionario(leccionId, cursoId),
}));

const { CursoViewer } = await import("./CursoViewer");

function leccion(id: string, title: string, completed: boolean) {
  return { id, position: 0, title, body: `Contenido de ${title}`, videoUrl: null, videoFile: null, archivos: [], completed, quiz: null };
}

const CURSO: CursoDetail = {
  id: "c1",
  title: "Seguridad industrial",
  description: null,
  category: "curso",
  status: "publicado",
  cover: null,
  completedAt: null,
  evaluacion: { passingScore: 70, maxAttempts: null },
  anunciarProximamente: false,
  tutorialModulo: null,
  anunciarAlIniciar: false,
  lecciones: [leccion("l1", "Introducción", true), leccion("l2", "Equipos de protección", false), leccion("l3", "Cierre", false)],
};

describe("CursoViewer", () => {
  beforeEach(() => {
    marcarLeccionVista.mockReset();
    iniciarCuestionario.mockReset();
    refresh.mockReset();
    push.mockReset();
  });

  const barra = () => within(screen.getByRole("navigation", { name: "Anterior y siguiente" }));

  it("opens the first pending lesson and shows overall progress", () => {
    render(<CursoViewer curso={CURSO} />);
    expect(screen.getByRole("heading", { name: "Equipos de protección" })).toBeTruthy();
    expect(screen.getByText("1 de 3 clases vistas")).toBeTruthy();
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
    expect(screen.getByText("Clase vista")).toBeTruthy();
  });

  it("shows a preview banner and no mark button for a draft course", () => {
    render(<CursoViewer curso={{ ...CURSO, status: "borrador" }} />);
    expect(screen.getByText(/Vista previa/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar como vista" })).toBeNull();
  });

  it("links back to the course's starting view and keeps the class in the URL", () => {
    render(<CursoViewer curso={CURSO} />);
    expect(screen.getByRole("link", { name: /Vista del curso/ }).getAttribute("href")).toBe("/aprendizaje/c1");
    fireEvent.click(screen.getByRole("button", { name: /Cierre/ }));
    expect(window.location.search).toBe("?leccion=l3");
  });

  describe("player layout", () => {
    it("puts the lesson video first, above the lesson title", () => {
      const conVideo: CursoDetail = {
        ...CURSO,
        lecciones: CURSO.lecciones.map((l) =>
          l.id === "l2" ? { ...l, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } : l,
        ),
      };
      const { container } = render(<CursoViewer curso={conVideo} />);
      const iframe = container.querySelector("iframe");
      const heading = screen.getByRole("heading", { name: "Equipos de protección" });
      expect(iframe?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      expect(iframe!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("shows the current class in the bottom bar and moves on with 'Siguiente'", async () => {
      marcarLeccionVista.mockResolvedValue({});
      render(<CursoViewer curso={CURSO} />);
      expect(barra().getByText("Clase 2 de 3")).toBeTruthy();

      fireEvent.click(barra().getByRole("button", { name: /Siguiente/ }));

      // A plain lesson is recorded as seen when moving on.
      await waitFor(() => expect(marcarLeccionVista).toHaveBeenCalledWith("l2", "c1"));
      await waitFor(() => expect(screen.getByRole("heading", { name: "Cierre" })).toBeTruthy());
    });

    it("just moves on from a lesson already seen", () => {
      render(<CursoViewer curso={CURSO} initialLeccionId="l1" />);
      fireEvent.click(barra().getByRole("button", { name: /Siguiente/ }));
      expect(marcarLeccionVista).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Equipos de protección" })).toBeTruthy();
    });

    it("goes back with 'Anterior', disabled on the first class", () => {
      render(<CursoViewer curso={CURSO} />);
      fireEvent.click(barra().getByRole("button", { name: "Anterior" }));
      expect(screen.getByRole("heading", { name: "Introducción" })).toBeTruthy();
      expect((barra().getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("finishes on the last class: records it and returns to the course view", async () => {
      marcarLeccionVista.mockResolvedValue({});
      render(<CursoViewer curso={CURSO} initialLeccionId="l3" />);
      expect(barra().queryByRole("button", { name: /Siguiente/ })).toBeNull();

      fireEvent.click(barra().getByRole("button", { name: /Terminar/ }));

      await waitFor(() => expect(marcarLeccionVista).toHaveBeenCalledWith("l3", "c1"));
      await waitFor(() => expect(push).toHaveBeenCalledWith("/aprendizaje/c1"));
    });
  });

  describe("lesson quizzes", () => {
    const conQuiz: CursoDetail = {
      ...CURSO,
      evaluacion: { passingScore: 70, maxAttempts: 2 },
      lecciones: [
        { ...leccion("l1", "Introducción", true), quiz: { questionsPerAttempt: 3, weight: 40 } },
        { ...leccion("l2", "Equipos de protección", false), quiz: { questionsPerAttempt: 5, weight: 60 } },
        leccion("l3", "Cierre", false),
      ],
    };
    const estados = {
      l1: { attemptsUsed: 1, passed: true, bestScore: 80, openIntentoId: null },
    };

    it("replaces 'Marcar como vista' with the lesson's quiz", () => {
      render(<CursoViewer curso={conQuiz} cuestionarios={estados} />);
      expect(screen.getByRole("heading", { name: "Equipos de protección" })).toBeTruthy();
      expect(screen.getByText("Cuestionario de la lección")).toBeTruthy();
      expect(screen.getByText(/5 preguntas · vale 60% de la nota del curso/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Marcar como vista" })).toBeNull();
    });

    it("starts the quiz and opens it", async () => {
      iniciarCuestionario.mockResolvedValue({ intentoId: "i1" });
      render(<CursoViewer curso={conQuiz} cuestionarios={estados} />);

      fireEvent.click(screen.getByRole("button", { name: "Responder cuestionario" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/aprendizaje/c1/evaluacion/i1"));
      expect(iniciarCuestionario).toHaveBeenCalledWith("l2", "c1");
    });

    it("starts the pending quiz from the bottom bar instead of 'Siguiente'", async () => {
      iniciarCuestionario.mockResolvedValue({ intentoId: "i9" });
      render(<CursoViewer curso={conQuiz} cuestionarios={estados} />);
      expect(barra().queryByRole("button", { name: /Siguiente/ })).toBeNull();

      fireEvent.click(barra().getByRole("button", { name: "Responder cuestionario de esta clase" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/aprendizaje/c1/evaluacion/i9"));
    });

    it("shows the lesson score and offers a retry while attempts remain", () => {
      render(<CursoViewer curso={conQuiz} cuestionarios={estados} initialLeccionId="l1" />);
      expect(screen.getByRole("heading", { name: "Introducción" })).toBeTruthy();
      expect(screen.getByText("Clase completada")).toBeTruthy();
      expect(screen.getByText("80%")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Repetir cuestionario" })).toBeTruthy();
    });

    it("doesn't show the course grade inside the player", () => {
      render(<CursoViewer curso={conQuiz} cuestionarios={estados} />);
      expect(screen.queryByLabelText("Nota del curso")).toBeNull();
      expect(screen.queryByText(/mínima para aprobar/)).toBeNull();
    });

    it("keeps 'Marcar como vista' for lessons without a quiz", () => {
      render(<CursoViewer curso={conQuiz} cuestionarios={estados} initialLeccionId="l3" />);
      expect(screen.getByRole("button", { name: "Marcar como vista" })).toBeTruthy();
    });

    // The reported bug: the course was completed before its lesson got a
    // quiz, and the quiz then showed no way to answer it.
    it("still lets someone who already completed the course answer a quiz added later", () => {
      const completadoAntes: CursoDetail = {
        ...conQuiz,
        completedAt: "2026-11-26T00:59:03Z",
        lecciones: conQuiz.lecciones.map((l) => ({ ...l, completed: true })),
      };
      render(<CursoViewer curso={completadoAntes} cuestionarios={{}} initialLeccionId="l2" />);
      expect(screen.getByText("Ya completaste este curso. Responde el cuestionario para registrar tu nota.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Responder cuestionario" })).toBeTruthy();
    });
  });
});
