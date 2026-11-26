import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";

const setTutorialModulo = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ setTutorialModulo: (...args: unknown[]) => setTutorialModulo(...args) }));

const { TutorialModuloEditor } = await import("./TutorialModuloEditor");

const MODULOS = [
  { key: "planificacion", label: "Planificación" },
  { key: "suministros", label: "Suministros" },
];

const CURSO: CursoDetail = {
  id: "c1",
  title: "Cómo usar Planificación",
  description: null,
  category: "curso",
  status: "publicado",
  cover: null,
  completedAt: null,
  evaluacion: { passingScore: 70, maxAttempts: null },
  anunciarProximamente: false,
  tutorialModulo: null,
  anunciarAlIniciar: false,
  lecciones: [
    {
      id: "l1",
      position: 0,
      title: "Introducción",
      body: null,
      videoUrl: "https://youtu.be/abc",
      videoFile: null,
      archivos: [],
      completed: false,
      quiz: null,
    },
  ],
};

describe("TutorialModuloEditor", () => {
  beforeEach(() => setTutorialModulo.mockReset().mockResolvedValue({}));

  it("tags the course as a module tutorial announced at login", async () => {
    render(<TutorialModuloEditor curso={CURSO} modulos={MODULOS} />);
    const checkbox = screen.getByLabelText("Mostrar al iniciar sesión") as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Módulo"), { target: { value: "planificacion" } });
    fireEvent.click(screen.getByLabelText("Mostrar al iniciar sesión"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar tutorial" }));

    await waitFor(() => expect(setTutorialModulo).toHaveBeenCalledWith("c1", "planificacion", true));
    expect(await screen.findByText("Tutorial guardado.")).toBeTruthy();
  });

  it("clears the module and the announcement", async () => {
    render(<TutorialModuloEditor curso={{ ...CURSO, tutorialModulo: "suministros", anunciarAlIniciar: true }} modulos={MODULOS} />);
    fireEvent.change(screen.getByLabelText("Módulo"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar tutorial" }));

    await waitFor(() => expect(setTutorialModulo).toHaveBeenCalledWith("c1", null, false));
  });

  it("warns when the course isn't published or has no video", () => {
    render(
      <TutorialModuloEditor
        curso={{
          ...CURSO,
          status: "borrador",
          tutorialModulo: "planificacion",
          anunciarAlIniciar: true,
          lecciones: [{ ...CURSO.lecciones[0], videoUrl: null }],
        }}
        modulos={MODULOS}
      />,
    );
    expect(screen.getByText("Se mostrará cuando publiques el curso.")).toBeTruthy();
    expect(screen.getByText(/Agrega un video a una lección/)).toBeTruthy();
  });

  it("shows a server error", async () => {
    setTutorialModulo.mockResolvedValue({ error: "No autorizado" });
    render(<TutorialModuloEditor curso={CURSO} modulos={MODULOS} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar tutorial" }));
    expect(await screen.findByText("No autorizado")).toBeTruthy();
  });
});
