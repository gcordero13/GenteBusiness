import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreguntaGestion } from "@/lib/aprendizaje/evaluacion";

const actions = {
  updateEvalSettings: vi.fn(),
  setPreguntaActiva: vi.fn(),
  deletePregunta: vi.fn(),
  savePregunta: vi.fn(),
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => actions);

const { EvaluacionEditor } = await import("./EvaluacionEditor");

const PREGUNTAS: PreguntaGestion[] = [
  {
    id: "p1",
    text: "¿Capital de RD?",
    type: "opcion_unica",
    active: true,
    options: [
      { id: "o1", text: "Santo Domingo", isCorrect: true },
      { id: "o2", text: "Santiago", isCorrect: false },
    ],
  },
  {
    id: "p2",
    text: "Pregunta vieja",
    type: "verdadero_falso",
    active: false,
    options: [
      { id: "o3", text: "Verdadero", isCorrect: false },
      { id: "o4", text: "Falso", isCorrect: true },
    ],
  },
];

const NO_EVAL = { questionsPerAttempt: null, passingScore: 70, maxAttempts: null };

describe("EvaluacionEditor", () => {
  beforeEach(() => Object.values(actions).forEach((fn) => fn.mockReset().mockResolvedValue({})));

  it("enables the evaluation with unlimited attempts", async () => {
    render(<EvaluacionEditor cursoId="c1" settings={NO_EVAL} preguntas={PREGUNTAS} />);

    fireEvent.click(screen.getByLabelText("Este curso tiene evaluación"));
    fireEvent.change(screen.getByLabelText("Preguntas por persona"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Nota mínima (%)"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() =>
      expect(actions.updateEvalSettings).toHaveBeenCalledWith("c1", {
        questionsPerAttempt: 1,
        passingScore: 80,
        maxAttempts: null,
      }),
    );
  });

  it("disables the evaluation", async () => {
    render(<EvaluacionEditor cursoId="c1" settings={{ questionsPerAttempt: 5, passingScore: 70, maxAttempts: 3 }} preguntas={PREGUNTAS} />);

    fireEvent.click(screen.getByLabelText("Este curso tiene evaluación"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() =>
      expect(actions.updateEvalSettings).toHaveBeenCalledWith("c1", {
        questionsPerAttempt: null,
        passingScore: 70,
        maxAttempts: 3,
      }),
    );
  });

  it("warns when the bank has fewer active questions than each person gets", () => {
    render(<EvaluacionEditor cursoId="c1" settings={{ questionsPerAttempt: 5, passingScore: 70, maxAttempts: null }} preguntas={PREGUNTAS} />);
    expect(screen.getByText(/a cada persona le tocarán solo 1/)).toBeTruthy();
  });

  it("lists the bank with the correct answers and toggles a question", async () => {
    render(<EvaluacionEditor cursoId="c1" settings={NO_EVAL} preguntas={PREGUNTAS} />);

    expect(screen.getByText("Banco de preguntas (1 activas de 2)")).toBeTruthy();
    expect(screen.getByText("Inactiva")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Desactivar" })[0]);

    await waitFor(() => expect(actions.setPreguntaActiva).toHaveBeenCalledWith("p1", "c1", false));
  });

  it("opens the form to add a question", () => {
    render(<EvaluacionEditor cursoId="c1" settings={NO_EVAL} preguntas={[]} />);
    expect(screen.getByText("Todavía no hay preguntas.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Agregar pregunta/ }));
    expect(screen.getByRole("button", { name: "Guardar pregunta" })).toBeTruthy();
  });
});
