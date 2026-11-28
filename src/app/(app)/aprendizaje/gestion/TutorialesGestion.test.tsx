import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tutorial } from "@/lib/aprendizaje/types";

const saveTutorial = vi.fn();
const setTutorialActivo = vi.fn();
const deleteTutorial = vi.fn();
const startUpload = vi.fn();
const uploadFileInChunks = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({
  saveTutorial: (...a: unknown[]) => saveTutorial(...a),
  setTutorialActivo: (...a: unknown[]) => setTutorialActivo(...a),
  deleteTutorial: (...a: unknown[]) => deleteTutorial(...a),
  startUpload: (...a: unknown[]) => startUpload(...a),
}));
vi.mock("@/lib/aprendizaje/chunkedUpload", () => ({ uploadFileInChunks: (...a: unknown[]) => uploadFileInChunks(...a) }));

const { TutorialesGestion } = await import("./TutorialesGestion");

const MODULOS = [
  { key: "planificacion", label: "Planificación" },
  { key: "suministros", label: "Suministros" },
];

const VIDEO: Tutorial = {
  id: "t1",
  title: "Cómo crear un proyecto",
  moduleKey: "planificacion",
  moduleLabel: "Planificación",
  videoUrl: null,
  videoFile: { driveId: "d1", itemId: "i1" },
  imagen: null,
  active: true,
};

describe("TutorialesGestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveTutorial.mockResolvedValue({});
    setTutorialActivo.mockResolvedValue({});
  });

  it("lists tutorials with their module and kind", () => {
    render(<TutorialesGestion tutoriales={[VIDEO]} modulos={MODULOS} />);
    expect(screen.getByText("Cómo crear un proyecto")).toBeTruthy();
    expect(screen.getByText("Planificación · Video")).toBeTruthy();
  });

  it("creates a tutorial with just a name, a module and an uploaded image", async () => {
    startUpload.mockResolvedValue({ uploadUrl: "https://upload.example/s" });
    uploadFileInChunks.mockResolvedValue({ driveId: "d9", itemId: "i9" });
    render(<TutorialesGestion tutoriales={[]} modulos={MODULOS} />);

    fireEvent.click(screen.getByRole("button", { name: /Nuevo tutorial/ }));
    fireEvent.change(screen.getByLabelText("Nombre del tutorial"), { target: { value: "Pedir suministros" } });
    fireEvent.change(screen.getByLabelText("Módulo"), { target: { value: "suministros" } });
    fireEvent.change(screen.getByTestId("upload-input"), {
      target: { files: [new File(["png"], "paso1.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Listo: paso1.png", {}, { timeout: 5000 })).toBeTruthy();
    expect(startUpload).toHaveBeenCalledWith("tutorial", { name: "paso1.png", size: 3, type: "image/png" });

    fireEvent.click(screen.getByRole("button", { name: "Crear tutorial" }));
    await waitFor(
      () =>
        expect(saveTutorial).toHaveBeenCalledWith({
          id: undefined,
        title: "Pedir suministros",
        moduleKey: "suministros",
          medio: { tipo: "imagen", file: { driveId: "d9", itemId: "i9" } },
        }),
      { timeout: 5000 },
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled(), { timeout: 5000 });
  });

  it("creates one from a YouTube link", async () => {
    render(<TutorialesGestion tutoriales={[]} modulos={MODULOS} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo tutorial/ }));
    fireEvent.change(screen.getByLabelText("Nombre del tutorial"), { target: { value: "Video" } });
    fireEvent.change(screen.getByLabelText("Módulo"), { target: { value: "planificacion" } });
    fireEvent.click(screen.getByLabelText("Enlace de YouTube o Vimeo"));
    fireEvent.change(screen.getByLabelText("Enlace del video"), { target: { value: "https://youtu.be/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tutorial" }));
    await waitFor(() =>
      expect(saveTutorial).toHaveBeenCalledWith(
        expect.objectContaining({ medio: { tipo: "enlace", url: "https://youtu.be/abc" } }),
      ),
    );
  });

  it("can be placed in Mi perfil (no module: seen by everyone)", async () => {
    render(<TutorialesGestion tutoriales={[]} modulos={MODULOS} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo tutorial/ }));
    fireEvent.change(screen.getByLabelText("Nombre del tutorial"), { target: { value: "Firma de correo" } });
    fireEvent.change(screen.getByLabelText("Módulo"), { target: { value: "__mi_perfil" } });
    expect(screen.getByRole("option", { name: "Mi perfil (todos los usuarios)" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Enlace de YouTube o Vimeo"));
    fireEvent.change(screen.getByLabelText("Enlace del video"), { target: { value: "https://youtu.be/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tutorial" }));
    await waitFor(() => expect(saveTutorial).toHaveBeenCalledWith(expect.objectContaining({ title: "Firma de correo", moduleKey: null })));
  });

  it("an existing Mi perfil tutorial opens with Mi perfil chosen", () => {
    render(<TutorialesGestion tutoriales={[{ ...VIDEO, moduleKey: null, moduleLabel: "Mi perfil" }]} modulos={MODULOS} />);
    expect(screen.getByText("Mi perfil · Video")).toBeTruthy();
  });

  it("can't be created without choosing the module", () => {
    render(<TutorialesGestion tutoriales={[]} modulos={MODULOS} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo tutorial/ }));
    fireEvent.change(screen.getByLabelText("Nombre del tutorial"), { target: { value: "Sin módulo" } });
    expect((screen.getByRole("button", { name: "Crear tutorial" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("turns a tutorial off", async () => {
    render(<TutorialesGestion tutoriales={[VIDEO]} modulos={MODULOS} />);
    fireEvent.click(screen.getByLabelText("Activo"));
    await waitFor(() => expect(setTutorialActivo).toHaveBeenCalledWith("t1", false));
  });

  it("edits the name without re-uploading the video", async () => {
    render(<TutorialesGestion tutoriales={[VIDEO]} modulos={MODULOS} />);
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    expect(screen.getByText(/Actual: Video subido/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nombre del tutorial"), { target: { value: "Crear un proyecto paso a paso" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(saveTutorial).toHaveBeenCalledWith({
        id: "t1",
        title: "Crear un proyecto paso a paso",
        moduleKey: "planificacion",
        medio: null,
      }),
    );
  });
});
