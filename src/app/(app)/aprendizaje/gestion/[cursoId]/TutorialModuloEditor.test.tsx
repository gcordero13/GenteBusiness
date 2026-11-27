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
  firma: { nombre: null, cargo: null, imagen: null },
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

  it("announces a tutorial of a module when the platform opens", async () => {
    render(<TutorialModuloEditor curso={CURSO} modulos={MODULOS} />);
    fireEvent.change(screen.getByLabelText("¿Explica un módulo?"), { target: { value: "planificacion" } });
    fireEvent.click(screen.getByLabelText("Mostrar al abrir la plataforma"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar aviso" }));

    await waitFor(() => expect(setTutorialModulo).toHaveBeenCalledWith("c1", "planificacion", true));
    expect(await screen.findByText("Aviso guardado.")).toBeTruthy();
  });

  it("announces a general tutorial (no module) too", async () => {
    render(<TutorialModuloEditor curso={{ ...CURSO, anunciarAlIniciar: true }} modulos={MODULOS} />);
    expect((screen.getByLabelText("Mostrar al abrir la plataforma") as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Guardar aviso" }));
    await waitFor(() => expect(setTutorialModulo).toHaveBeenCalledWith("c1", null, true));
  });

  it("can turn the announcement off", async () => {
    render(<TutorialModuloEditor curso={{ ...CURSO, tutorialModulo: "suministros", anunciarAlIniciar: true }} modulos={MODULOS} />);
    fireEvent.click(screen.getByLabelText("Mostrar al abrir la plataforma"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar aviso" }));
    await waitFor(() => expect(setTutorialModulo).toHaveBeenCalledWith("c1", "suministros", false));
  });

  it("warns when the tutorial isn't published or has no video or image", () => {
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
    expect(screen.getByText("Se mostrará cuando publiques el tutorial.")).toBeTruthy();
    expect(screen.getByText(/Agrega un video o una imagen/)).toBeTruthy();
  });

  it("shows a server error", async () => {
    setTutorialModulo.mockResolvedValue({ error: "No autorizado" });
    render(<TutorialModuloEditor curso={CURSO} modulos={MODULOS} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar aviso" }));
    expect(await screen.findByText("No autorizado")).toBeTruthy();
  });
});
