import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leccion } from "@/lib/aprendizaje/types";

const updateEvalSettings = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ updateEvalSettings: (...args: unknown[]) => updateEvalSettings(...args) }));

const { EvaluacionEditor } = await import("./EvaluacionEditor");

function leccion(id: string, title: string, weight: number | null): Leccion {
  return {
    id,
    position: 0,
    title,
    body: null,
    videoUrl: null,
    videoFile: null,
    archivos: [],
    completed: false,
    quiz: weight === null ? null : { questionsPerAttempt: 5, weight },
  };
}

const SETTINGS = { passingScore: 70, maxAttempts: null };

describe("EvaluacionEditor", () => {
  beforeEach(() => updateEvalSettings.mockReset().mockResolvedValue({}));

  it("saves the minimum grade and attempts per quiz (empty = unlimited)", async () => {
    render(<EvaluacionEditor cursoId="c1" settings={SETTINGS} lecciones={[]} />);

    fireEvent.change(screen.getByLabelText("Nota mínima para aprobar el curso (%)"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Intentos por cuestionario"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));
    await waitFor(() => expect(updateEvalSettings).toHaveBeenCalledWith("c1", { passingScore: 80, maxAttempts: 3 }));

    fireEvent.change(screen.getByLabelText("Intentos por cuestionario"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));
    await waitFor(() => expect(updateEvalSettings).toHaveBeenLastCalledWith("c1", { passingScore: 80, maxAttempts: null }));
  });

  it("validates before saving", () => {
    render(<EvaluacionEditor cursoId="c1" settings={SETTINGS} lecciones={[]} />);
    fireEvent.change(screen.getByLabelText("Nota mínima para aprobar el curso (%)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));
    expect(screen.getByText("La nota mínima debe estar entre 1 y 100.")).toBeTruthy();
    expect(updateEvalSettings).not.toHaveBeenCalled();
  });

  it("lists the quiz weights and confirms when they add up to 100%", () => {
    render(
      <EvaluacionEditor
        cursoId="c1"
        settings={SETTINGS}
        lecciones={[leccion("l1", "Contraseñas", 30), leccion("l2", "Phishing", 70), leccion("l3", "Video final", null)]}
      />,
    );
    expect(screen.getByText("Contraseñas")).toBeTruthy();
    expect(screen.getByText("Phishing")).toBeTruthy();
    expect(screen.queryByText("Video final")).toBeNull();
    expect(screen.getByText("100% de 100%")).toBeTruthy();
    expect(screen.queryByText(/deben sumar exactamente 100%/)).toBeNull();
  });

  it("warns when the weights don't add up to 100%", () => {
    render(<EvaluacionEditor cursoId="c1" settings={SETTINGS} lecciones={[leccion("l1", "Contraseñas", 30)]} />);
    expect(screen.getByText("30% de 100%")).toBeTruthy();
    expect(screen.getByText("Los pesos deben sumar exactamente 100% para poder publicar el curso.")).toBeTruthy();
  });

  it("explains a course without quizzes", () => {
    render(<EvaluacionEditor cursoId="c1" settings={SETTINGS} lecciones={[leccion("l1", "Única", null)]} />);
    expect(screen.getByText(/Ninguna lección tiene cuestionario todavía/)).toBeTruthy();
  });
});
