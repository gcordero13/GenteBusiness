import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";

const setCursoFirma = vi.fn();
const startUpload = vi.fn();
const uploadFileInChunks = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions", () => ({
  setCursoFirma: (...args: unknown[]) => setCursoFirma(...args),
  startUpload: (...args: unknown[]) => startUpload(...args),
}));
vi.mock("@/lib/aprendizaje/chunkedUpload", () => ({
  uploadFileInChunks: (...args: unknown[]) => uploadFileInChunks(...args),
}));

const { FirmaCertificadoEditor } = await import("./FirmaCertificadoEditor");

const CURSO: CursoDetail = {
  id: "c1",
  title: "Ciberseguridad",
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
  lecciones: [],
};

describe("FirmaCertificadoEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCursoFirma.mockResolvedValue({});
  });

  it("saves the signer's name and position", async () => {
    render(<FirmaCertificadoEditor curso={CURSO} />);
    fireEvent.change(screen.getByLabelText("Nombre de quien firma"), { target: { value: "Laura Martínez" } });
    fireEvent.change(screen.getByLabelText("Cargo"), { target: { value: "Gerente de Gestión Humana" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar firma" }));

    await waitFor(() =>
      expect(setCursoFirma).toHaveBeenCalledWith("c1", {
        nombre: "Laura Martínez",
        cargo: "Gerente de Gestión Humana",
        imagen: null,
      }),
    );
    expect(await screen.findByText("Firma guardada.")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server's error", async () => {
    setCursoFirma.mockResolvedValue({ error: "Escribe el nombre de quien firma." });
    render(<FirmaCertificadoEditor curso={CURSO} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar firma" }));
    expect(await screen.findByText("Escribe el nombre de quien firma.")).toBeTruthy();
  });

  it("uploads a signature image and saves it with the typed name", async () => {
    startUpload.mockResolvedValue({ uploadUrl: "https://upload.example/s" });
    uploadFileInChunks.mockResolvedValue({ driveId: "d1", itemId: "i1" });
    render(<FirmaCertificadoEditor curso={CURSO} />);
    fireEvent.change(screen.getByLabelText("Nombre de quien firma"), { target: { value: "Laura Martínez" } });

    fireEvent.change(screen.getByTestId("upload-input"), {
      target: { files: [new File(["png"], "firma.png", { type: "image/png" })] },
    });

    await waitFor(() =>
      expect(setCursoFirma).toHaveBeenCalledWith("c1", {
        nombre: "Laura Martínez",
        cargo: "",
        imagen: { driveId: "d1", itemId: "i1" },
      }),
    );
    expect(startUpload).toHaveBeenCalledWith("firma", { name: "firma.png", size: 3, type: "image/png" });
  });

  it("previews the current signature and can remove it", async () => {
    render(
      <FirmaCertificadoEditor
        curso={{ ...CURSO, firma: { nombre: "Laura Martínez", cargo: "Gerente", imagen: { driveId: "d1", itemId: "i1" } } }}
      />,
    );
    expect(screen.getByAltText("Firma del certificado").getAttribute("src")).toBe("/api/aprendizaje/archivo/d1/i1");
    expect(screen.getByRole("button", { name: /Cambiar firma/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Quitar firma" }));
    await waitFor(() =>
      expect(setCursoFirma).toHaveBeenCalledWith("c1", { nombre: "Laura Martínez", cargo: "Gerente", imagen: null }),
    );
  });
});
