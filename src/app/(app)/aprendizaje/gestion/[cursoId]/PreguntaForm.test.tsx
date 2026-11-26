import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const savePregunta = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ savePregunta: (...args: unknown[]) => savePregunta(...args) }));

const { PreguntaForm } = await import("./PreguntaForm");

describe("PreguntaForm", () => {
  beforeEach(() => savePregunta.mockReset().mockResolvedValue({}));

  it("creates a single-choice question", async () => {
    const onDone = vi.fn();
    render(<PreguntaForm cursoId="c1" leccionId="l1" onDone={onDone} />);

    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "¿Capital de RD?" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 1"), { target: { value: "Santiago" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 2"), { target: { value: "Santo Domingo" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar opción/ }));
    fireEvent.change(screen.getByLabelText("Texto de la opción 3"), { target: { value: "La Vega" } });
    fireEvent.click(screen.getByLabelText("Marcar opción 2 como correcta"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    await waitFor(() =>
      expect(savePregunta).toHaveBeenCalledWith("c1", "l1", {
        id: undefined,
        text: "¿Capital de RD?",
        type: "opcion_unica",
        options: [
          { text: "Santiago", isCorrect: false },
          { text: "Santo Domingo", isCorrect: true },
          { text: "La Vega", isCorrect: false },
        ],
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("validates before saving", () => {
    render(<PreguntaForm cursoId="c1" leccionId="l1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "¿?" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 1"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 2"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    expect(screen.getByText("Marca exactamente una opción correcta.")).toBeTruthy();
    expect(savePregunta).not.toHaveBeenCalled();
  });

  it("creates a true/false question", async () => {
    render(<PreguntaForm cursoId="c1" leccionId="l1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "El sol es una estrella" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "verdadero_falso" } });
    fireEvent.click(screen.getByLabelText("Marcar opción 1 como correcta"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    await waitFor(() =>
      expect(savePregunta).toHaveBeenCalledWith("c1", "l1", {
        id: undefined,
        text: "El sol es una estrella",
        type: "verdadero_falso",
        options: [
          { text: "Verdadero", isCorrect: true },
          { text: "Falso", isCorrect: false },
        ],
      }),
    );
  });

  it("edits an existing question keeping option ids", async () => {
    render(
      <PreguntaForm
        cursoId="c1"
        leccionId="l1"
        onDone={vi.fn()}
        initial={{
          id: "p1",
          leccionId: "l1",
          text: "Vieja",
          type: "opcion_unica",
          active: true,
          options: [
            { id: "o1", text: "A", isCorrect: true },
            { id: "o2", text: "B", isCorrect: false },
          ],
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "Nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    await waitFor(() =>
      expect(savePregunta).toHaveBeenCalledWith("c1", "l1", {
        id: "p1",
        text: "Nueva",
        type: "opcion_unica",
        options: [
          { id: "o1", text: "A", isCorrect: true },
          { id: "o2", text: "B", isCorrect: false },
        ],
      }),
    );
  });
});
