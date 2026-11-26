import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const RESULTADO = { score: 50, passed: false, correct: 1, total: 2, notaCurso: 62, cursoCompletado: false };

function renderForm(overrides: Partial<Parameters<typeof EvaluacionForm>[0]> = {}) {
  return render(
    <EvaluacionForm
      cursoId="c1"
      intento={INTENTO}
      passingScore={70}
      secondsPerQuestion={null}
      siguienteLeccionId="l3"
      {...overrides}
    />,
  );
}

describe("EvaluacionForm", () => {
  beforeEach(() => enviarIntento.mockReset().mockResolvedValue({ resultado: RESULTADO }));
  afterEach(() => vi.useRealTimers());

  it("explains the rules before starting", () => {
    renderForm({ secondsPerQuestion: 30 });
    expect(screen.getByText(/2 preguntas/)).toBeTruthy();
    expect(screen.getByText(/30 segundos por pregunta/)).toBeTruthy();
    expect(screen.getByText(/No podrás volver a una pregunta anterior/)).toBeTruthy();
    expect(screen.queryByText("¿Capital de RD?")).toBeNull();
  });

  it("shows one question at a time and advances as soon as it's answered", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Comenzar" }));

    expect(screen.getByText("Pregunta 1 de 2")).toBeTruthy();
    expect(screen.getByText("¿Capital de RD?")).toBeTruthy();
    expect(screen.queryByText("El agua hierve a 100 °C")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Santo Domingo" }));
    expect(screen.getByText("Pregunta 2 de 2")).toBeTruthy();
    expect(screen.queryByText("¿Capital de RD?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Verdadero" }));
    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", { p1: "o2", p2: "o3" }));
  });

  it("moves on when the time runs out, leaving the question unanswered", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm({ secondsPerQuestion: 10 });
    fireEvent.click(screen.getByRole("button", { name: "Comenzar" }));

    expect(screen.getByText("0:10")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("0:06")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByText("Pregunta 2 de 2")).toBeTruthy();
    expect(screen.getByText("0:10")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Falso" }));
    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", { p2: "o4" }));
  });

  it("submits when the last question times out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm({ secondsPerQuestion: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Comenzar" }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", {}));
  });

  it("shows the result with the course grade and the next lesson", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Comenzar" }));
    fireEvent.click(screen.getByRole("button", { name: "Santo Domingo" }));
    fireEvent.click(screen.getByRole("button", { name: "Verdadero" }));

    expect(await screen.findByText("50%")).toBeTruthy();
    expect(screen.getByText("1 de 2 respuestas correctas")).toBeTruthy();
    expect(screen.getByText("62%")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Siguiente clase/ }).getAttribute("href")).toBe("/aprendizaje/c1?leccion=l3");
    expect(screen.getByRole("link", { name: "Volver a la lección" }).getAttribute("href")).toBe("/aprendizaje/c1?leccion=l2");
  });

  it("celebrates when the attempt completes the course", async () => {
    enviarIntento.mockResolvedValue({ resultado: { ...RESULTADO, score: 100, notaCurso: 85, cursoCompletado: true } });
    renderForm({ siguienteLeccionId: null });
    fireEvent.click(screen.getByRole("button", { name: "Comenzar" }));
    fireEvent.click(screen.getByRole("button", { name: "Santo Domingo" }));
    fireEvent.click(screen.getByRole("button", { name: "Verdadero" }));

    expect(await screen.findByText("¡Completaste el curso!")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Siguiente clase/ })).toBeNull();
  });

  it("shows the stored score for an attempt already submitted", () => {
    renderForm({ intento: { ...INTENTO, submitted: true, score: 80, passed: true } });
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Comenzar" })).toBeNull();
  });

  it("shows a server error", async () => {
    enviarIntento.mockResolvedValue({ error: "Este intento ya fue enviado" });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Comenzar" }));
    fireEvent.click(screen.getByRole("button", { name: "Santo Domingo" }));
    fireEvent.click(screen.getByRole("button", { name: "Verdadero" }));

    expect(await screen.findByText("Este intento ya fue enviado")).toBeTruthy();
  });
});
