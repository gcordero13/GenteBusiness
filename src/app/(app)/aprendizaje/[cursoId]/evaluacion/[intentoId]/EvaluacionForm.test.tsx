import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntentoDetail } from "@/lib/aprendizaje/evaluacion";

const enviarIntento = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../../actions", () => ({
  enviarIntento: (...args: unknown[]) => enviarIntento(...args),
}));

const { EvaluacionForm } = await import("./EvaluacionForm");

const INTENTO: IntentoDetail = {
  id: "i1",
  cursoId: "c1",
  leccionId: "l2",
  submitted: false,
  score: null,
  passed: null,
  preguntas: [
    { id: "p1", text: "¿Capital de RD?", type: "opcion_unica", options: [{ id: "o1", text: "Santiago" }, { id: "o2", text: "Santo Domingo" }] },
    { id: "p2", text: "El agua hierve a 100 °C", type: "verdadero_falso", options: [{ id: "o3", text: "Verdadero" }, { id: "o4", text: "Falso" }] },
  ],
};

function answerAll() {
  fireEvent.click(screen.getByLabelText("Santo Domingo"));
  fireEvent.click(screen.getByLabelText("Verdadero"));
}

describe("EvaluacionForm", () => {
  beforeEach(() => enviarIntento.mockReset());

  it("only enables sending once every question is answered", () => {
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);
    const send = screen.getByRole("button", { name: "Enviar respuestas" }) as HTMLButtonElement;

    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Santo Domingo"));
    expect(screen.getByText("1 de 2 respondidas")).toBeTruthy();
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Verdadero"));
    expect(send.disabled).toBe(false);
  });

  it("submits and shows the lesson score and the course grade", async () => {
    enviarIntento.mockResolvedValue({
      resultado: { score: 50, passed: false, correct: 1, total: 2, notaCurso: 62, cursoCompletado: false },
    });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);

    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", { p1: "o2", p2: "o3" }));
    expect(await screen.findByText("50%")).toBeTruthy();
    expect(screen.getByText("1 de 2 respuestas correctas")).toBeTruthy();
    expect(screen.getByText("62%")).toBeTruthy();
    expect(screen.queryByText("¡Completaste el curso!")).toBeNull();
    expect(screen.getByRole("link", { name: "Volver a la lección" }).getAttribute("href")).toBe("/aprendizaje/c1?leccion=l2");
  });

  it("celebrates when the attempt completes the course", async () => {
    enviarIntento.mockResolvedValue({
      resultado: { score: 100, passed: true, correct: 2, total: 2, notaCurso: 85, cursoCompletado: true },
    });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);

    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    expect(await screen.findByText("¡Completaste el curso!")).toBeTruthy();
  });

  it("shows the stored score for an attempt already submitted", () => {
    render(<EvaluacionForm cursoId="c1" intento={{ ...INTENTO, submitted: true, score: 80, passed: true }} passingScore={70} />);
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar respuestas" })).toBeNull();
  });

  it("shows a server error", async () => {
    enviarIntento.mockResolvedValue({ error: "Este intento ya fue enviado" });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);
    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    expect(await screen.findByText("Este intento ya fue enviado")).toBeTruthy();
  });
});
