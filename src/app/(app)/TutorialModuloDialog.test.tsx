import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorialPendiente } from "@/lib/aprendizaje/tutoriales";

const cerrarTutorial = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ cerrarTutorial: (...args: unknown[]) => cerrarTutorial(...args) }));

const { TutorialModuloDialog } = await import("./TutorialModuloDialog");

const TUTORIAL: TutorialPendiente = {
  tutorialId: "t1",
  title: "Cómo crear un proyecto",
  moduleLabel: "Planificación",
  videoUrl: null,
  videoFile: { driveId: "d1", itemId: "i1" },
  imagen: null,
};

describe("TutorialModuloDialog", () => {
  beforeEach(() => {
    cerrarTutorial.mockReset().mockResolvedValue({});
    refresh.mockReset();
  });

  it("shows the module's tutorial with its video", () => {
    const { baseElement } = render(<TutorialModuloDialog tutorial={TUTORIAL} canViewAprendizaje />);
    expect(screen.getByText(/Tutorial · Planificación/)).toBeTruthy();
    expect(screen.getByText("Cómo crear un proyecto")).toBeTruthy();
    expect(baseElement.querySelector("video")?.getAttribute("src")).toBe("/api/aprendizaje/archivo/d1/i1");
    expect(screen.getByRole("link", { name: "Ver todos los tutoriales" }).getAttribute("href")).toBe(
      "/aprendizaje?categoria=tutorial#catalogo",
    );
  });

  it("shows the image when the tutorial is an image", () => {
    render(<TutorialModuloDialog tutorial={{ ...TUTORIAL, videoFile: null, imagen: { driveId: "d9", itemId: "i9" } }} canViewAprendizaje />);
    expect(screen.getByAltText("Cómo crear un proyecto").getAttribute("src")).toBe("/api/aprendizaje/archivo/d9/i9");
  });

  it("records the close so it doesn't show again", async () => {
    render(<TutorialModuloDialog tutorial={TUTORIAL} canViewAprendizaje />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(cerrarTutorial).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Cómo crear un proyecto")).toBeNull());
  });

  it("hides the Aprende link from people without access to it", () => {
    render(<TutorialModuloDialog tutorial={TUTORIAL} canViewAprendizaje={false} />);
    expect(screen.queryByRole("link", { name: "Ver todos los tutoriales" })).toBeNull();
  });
});
