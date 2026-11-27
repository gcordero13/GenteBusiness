import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorialPendiente } from "@/lib/aprendizaje/tutoriales";

const cerrarTutorial = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ cerrarTutorial: (...args: unknown[]) => cerrarTutorial(...args) }));

const { TutorialModuloDialog } = await import("./TutorialModuloDialog");

const TUTORIAL: TutorialPendiente = {
  cursoId: "c1",
  title: "Cómo usar Planificación",
  description: "Proyectos y tareas en un solo lugar",
  moduleLabel: "Planificación",
  leccionTitle: "Introducción",
  videoUrl: null,
  videoFile: { driveId: "d1", itemId: "i1" },
  imagen: null,
};

describe("TutorialModuloDialog", () => {
  beforeEach(() => {
    cerrarTutorial.mockReset().mockResolvedValue({});
    refresh.mockReset();
  });

  it("announces the new module with its video", () => {
    const { baseElement } = render(<TutorialModuloDialog tutorial={TUTORIAL} canViewAprendizaje />);
    expect(screen.getByText(/Nuevo módulo: Planificación/)).toBeTruthy();
    expect(screen.getByText("Cómo usar Planificación")).toBeTruthy();
    expect(baseElement.querySelector("video")?.getAttribute("src")).toBe("/api/aprendizaje/archivo/d1/i1");
    expect(screen.getByRole("link", { name: "Ver en Aprende" }).getAttribute("href")).toBe("/aprendizaje/c1");
  });

  it("records the close so it doesn't show again", async () => {
    render(<TutorialModuloDialog tutorial={TUTORIAL} canViewAprendizaje />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(cerrarTutorial).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Cómo usar Planificación")).toBeNull());
  });

  it("shows a general tutorial's image when it has no video", () => {
    render(
      <TutorialModuloDialog
        tutorial={{ ...TUTORIAL, moduleLabel: null, videoFile: null, imagen: { driveId: "d9", itemId: "i9" } }}
        canViewAprendizaje
      />,
    );
    expect(screen.getByText("Nuevo tutorial")).toBeTruthy();
    expect(screen.getByAltText("Cómo usar Planificación").getAttribute("src")).toBe("/api/aprendizaje/archivo/d9/i9");
  });

  it("hides the Aprendizaje link from people without access to it", () => {
    render(<TutorialModuloDialog tutorial={TUTORIAL} canViewAprendizaje={false} />);
    expect(screen.queryByRole("link", { name: "Ver en Aprende" })).toBeNull();
  });
});
