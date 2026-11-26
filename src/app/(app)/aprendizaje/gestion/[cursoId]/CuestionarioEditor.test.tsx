import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreguntaGestion } from "@/lib/aprendizaje/evaluacion";

const actions = {
  setLeccionQuiz: vi.fn(),
  setPreguntaActiva: vi.fn(),
  deletePregunta: vi.fn(),
  savePregunta: vi.fn(),
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => actions);

const { CuestionarioEditor } = await import("./CuestionarioEditor");

const PREGUNTAS: PreguntaGestion[] = [
  {
    id: "p1",
    leccionId: "l1",
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
    leccionId: "l1",
    text: "Pregunta vieja",
    type: "verdadero_falso",
    active: false,
    options: [
      { id: "o3", text: "Verdadero", isCorrect: false },
      { id: "o4", text: "Falso", isCorrect: true },
    ],
  },
];

describe("CuestionarioEditor", () => {
  beforeEach(() => Object.values(actions).forEach((fn) => fn.mockReset().mockResolvedValue({})));

  it("turns the quiz on with its weight and questions per person", async () => {
    render(<CuestionarioEditor cursoId="c1" leccionId="l1" quiz={null} preguntas={[]} />);

    fireEvent.click(screen.getByLabelText("Esta lección tiene cuestionario"));
    fireEvent.change(screen.getByLabelText("Peso en la nota del curso (%)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Preguntas por persona"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cuestionario" }));

    await waitFor(() =>
      expect(actions.setLeccionQuiz).toHaveBeenCalledWith("l1", "c1", { questionsPerAttempt: 3, weight: 40 }),
    );
  });

  it("validates the weight", () => {
    render(<CuestionarioEditor cursoId="c1" leccionId="l1" quiz={null} preguntas={[]} />);
    fireEvent.click(screen.getByLabelText("Esta lección tiene cuestionario"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cuestionario" }));
    expect(screen.getByText("El peso debe ser un número entre 1 y 100.")).toBeTruthy();
    expect(actions.setLeccionQuiz).not.toHaveBeenCalled();
  });

  it("turns the quiz off", async () => {
    render(
      <CuestionarioEditor cursoId="c1" leccionId="l1" quiz={{ questionsPerAttempt: 5, weight: 30 }} preguntas={PREGUNTAS} />,
    );
    fireEvent.click(screen.getByLabelText("Esta lección tiene cuestionario"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cuestionario" }));
    await waitFor(() => expect(actions.setLeccionQuiz).toHaveBeenCalledWith("l1", "c1", null));
  });

  it("shows the lesson's bank and warns when it has fewer active questions than each person gets", async () => {
    render(
      <CuestionarioEditor cursoId="c1" leccionId="l1" quiz={{ questionsPerAttempt: 5, weight: 30 }} preguntas={PREGUNTAS} />,
    );
    expect(screen.getByText("Banco de preguntas (1 activas de 2)")).toBeTruthy();
    expect(screen.getByText(/a cada persona le tocarán solo 1/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Desactivar" })[0]);
    await waitFor(() => expect(actions.setPreguntaActiva).toHaveBeenCalledWith("p1", "c1", false));

    fireEvent.click(screen.getByRole("button", { name: /Agregar pregunta/ }));
    expect(screen.getByRole("button", { name: "Guardar pregunta" })).toBeTruthy();
  });

  it("hides the bank until the quiz is saved", () => {
    render(<CuestionarioEditor cursoId="c1" leccionId="l1" quiz={null} preguntas={[]} />);
    expect(screen.queryByText(/Banco de preguntas/)).toBeNull();
  });
});
