import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IntentoDetail } from "@/lib/aprendizaje/evaluacion";

const enviarIntento = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
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

/** Gives every question of the attempt the same time limit. */
const conTiempo = (seconds: number | null): IntentoDetail => ({
  ...INTENTO,
  preguntas: INTENTO.preguntas.map((p) => ({ ...p, seconds })),
});

function renderForm(overrides: Partial<Parameters<typeof EvaluacionForm>[0]> = {}) {
  return render(
    <EvaluacionForm
      cursoId="c1"
      intento={INTENTO}
      passingScore={70}
      siguienteLeccionId="l3"
      advanceDelayMs={0}
      {...overrides}
    />,
  );
}

/** Picks an option (shown with a letter badge) by its text. */
const elegir = (text: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(text) }));

async function responderTodo() {
  fireEvent.click(screen.getByRole("button", { name: /Comenzar/ }));
  elegir("Santo Domingo");
  await screen.findByText("Pregunta 2 de 2");
  elegir("Verdadero");
}

describe("EvaluacionForm", () => {
  beforeEach(() => {
    enviarIntento.mockReset().mockResolvedValue({ resultado: RESULTADO });
    push.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("explains the rules before starting", () => {
    renderForm({ intento: conTiempo(30) });
    expect(screen.getByText(/2 preguntas/)).toBeTruthy();
    expect(screen.getByText(/30 segundos por pregunta/)).toBeTruthy();
    expect(screen.getByText(/No podrás volver a una pregunta anterior/)).toBeTruthy();
    expect(screen.queryByText("¿Capital de RD?")).toBeNull();
  });

  it("shows one question at a time with lettered options and advances once answered", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Comenzar/ }));

    expect(screen.getByText("Pregunta 1 de 2")).toBeTruthy();
    expect(screen.getByText("¿Capital de RD?")).toBeTruthy();
    expect(screen.queryByText("El agua hierve a 100 °C")).toBeNull();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();

    elegir("Santo Domingo");
    expect(await screen.findByText("Pregunta 2 de 2")).toBeTruthy();
    expect(screen.queryByText("¿Capital de RD?")).toBeNull();

    elegir("Verdadero");
    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", { p1: "o2", p2: "o3" }));
  });

  it("highlights the chosen option and ignores further clicks before moving on", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm({ advanceDelayMs: 500 });
    fireEvent.click(screen.getByRole("button", { name: /Comenzar/ }));

    elegir("Santo Domingo");
    elegir("Santiago");
    // Still on the question, options locked while the choice is shown.
    expect(screen.getByText("Pregunta 1 de 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Santiago/ }) as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Pregunta 2 de 2")).toBeTruthy();
  });

  it("moves on when the time runs out, leaving the question unanswered", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm({ intento: conTiempo(10) });
    fireEvent.click(screen.getByRole("button", { name: /Comenzar/ }));

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

    elegir("Falso");
    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", { p2: "o4" }));
  });

  it("uses each question's own time, and none when it has no limit", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm({
      intento: { ...INTENTO, preguntas: [{ ...INTENTO.preguntas[0], seconds: 15 }, { ...INTENTO.preguntas[1], seconds: null }] },
    });
    expect(screen.getByText(/Algunas preguntas tienen tiempo límite/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Comenzar/ }));
    expect(screen.getByText("0:15")).toBeTruthy();

    elegir("Santo Domingo");
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText("Pregunta 2 de 2")).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Pregunta 2 de 2")).toBeTruthy();
  });

  it("submits when the last question times out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm({ intento: conTiempo(5) });
    fireEvent.click(screen.getByRole("button", { name: /Comenzar/ }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", {}));
  });

  it("shows the result with the course grade and the next class", async () => {
    renderForm();
    await responderTodo();

    expect(await screen.findByText("50%")).toBeTruthy();
    expect(screen.getByText("¡Terminaste el cuestionario!")).toBeTruthy();
    expect(screen.getByText("1 de 2 respuestas correctas")).toBeTruthy();
    expect(screen.getByText("62%")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Siguiente clase/ }).getAttribute("href")).toBe("/aprendizaje/c1?leccion=l3");
    expect(screen.getByRole("link", { name: "Volver a la clase" }).getAttribute("href")).toBe("/aprendizaje/c1?leccion=l2");
  });

  it("congratulates a passing score and moves to the next class on its own", async () => {
    enviarIntento.mockResolvedValue({ resultado: { ...RESULTADO, score: 100, correct: 2 } });
    renderForm({ autoAvanceSegundos: 1 });
    await responderTodo();

    expect(await screen.findByText("¡Excelente trabajo!")).toBeTruthy();
    expect(screen.getByText(/Pasando a la siguiente clase en/)).toBeTruthy();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/aprendizaje/c1?leccion=l3"), { timeout: 4000 });
  });

  it("lets the person stay on the result instead of moving on", async () => {
    renderForm({ autoAvanceSegundos: 1 });
    await responderTodo();

    fireEvent.click(await screen.findByRole("button", { name: "Quedarme aquí" }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(/Pasando a la siguiente clase/)).toBeNull();
  });

  it("celebrates completing the course and offers the course view on the last class", async () => {
    enviarIntento.mockResolvedValue({ resultado: { ...RESULTADO, score: 100, notaCurso: 85, cursoCompletado: true } });
    renderForm({ siguienteLeccionId: null });
    await responderTodo();

    expect(await screen.findByText("¡Felicidades, completaste el curso!")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Siguiente clase/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Ver el curso/ }).getAttribute("href")).toBe("/aprendizaje/c1");
    expect(screen.queryByText(/Pasando a la siguiente clase/)).toBeNull();
  });

  it("shows the stored score for an attempt already submitted, without moving on by itself", () => {
    renderForm({ intento: { ...INTENTO, submitted: true, score: 80, passed: true } });
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Comenzar/ })).toBeNull();
    expect(screen.queryByText(/Pasando a la siguiente clase/)).toBeNull();
  });

  it("shows a server error", async () => {
    enviarIntento.mockResolvedValue({ error: "Este intento ya fue enviado" });
    renderForm();
    await responderTodo();

    expect(await screen.findByText("Este intento ya fue enviado")).toBeTruthy();
  });
});
