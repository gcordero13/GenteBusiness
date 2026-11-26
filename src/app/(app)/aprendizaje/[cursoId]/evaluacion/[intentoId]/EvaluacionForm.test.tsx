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
  submitted: false,
  score: null,
  passed: null,
  preguntas: [
    { id: "p1", text: "¿Capital de RD?", type: "opcion_unica", options: [{ id: "o1", text: "Santiago" }, { id: "o2", text: "Santo Domingo" }] },
    { id: "p2", text: "El agua hierve a 100 °C", type: "verdadero_falso", options: [{ id: "o3", text: "Verdadero" }, { id: "o4", text: "Falso" }] },
  ],
};

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

  it("submits the answers and shows a passing result", async () => {
    enviarIntento.mockResolvedValue({ resultado: { score: 100, passed: true, correct: 2, total: 2 } });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);

    fireEvent.click(screen.getByLabelText("Santo Domingo"));
    fireEvent.click(screen.getByLabelText("Verdadero"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", { p1: "o2", p2: "o3" }));
    expect(await screen.findByText("¡Aprobaste!")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText(/2 de 2 respuestas correctas/)).toBeTruthy();
  });

  it("shows a failing result", async () => {
    enviarIntento.mockResolvedValue({ resultado: { score: 50, passed: false, correct: 1, total: 2 } });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);

    fireEvent.click(screen.getByLabelText("Santiago"));
    fireEvent.click(screen.getByLabelText("Falso"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    expect(await screen.findByText("No alcanzaste la nota mínima")).toBeTruthy();
  });

  it("shows the stored result for an attempt already submitted", () => {
    render(<EvaluacionForm cursoId="c1" intento={{ ...INTENTO, submitted: true, score: 80, passed: true }} passingScore={70} />);
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar respuestas" })).toBeNull();
  });

  it("shows a server error", async () => {
    enviarIntento.mockResolvedValue({ error: "Este intento ya fue enviado" });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);
    fireEvent.click(screen.getByLabelText("Santo Domingo"));
    fireEvent.click(screen.getByLabelText("Verdadero"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    expect(await screen.findByText("Este intento ya fue enviado")).toBeTruthy();
  });
});
