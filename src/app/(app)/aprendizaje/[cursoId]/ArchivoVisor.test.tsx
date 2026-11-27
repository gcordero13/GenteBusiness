import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeccionArchivo } from "@/lib/aprendizaje/types";
import { ArchivoVisor } from "./ArchivoVisor";

const fetchMock = vi.fn();

function archivo(filename: string, contentType: string): LeccionArchivo {
  return { id: "a1", filename, contentType, sizeBytes: 1_300_000, driveId: "d1", itemId: "i1" };
}

async function abrir(a: LeccionArchivo) {
  render(
    <ArchivoVisor archivo={a} triggerLabel={`Ver ${a.filename}`} triggerClassName="">
      Ver
    </ArchivoVisor>,
  );
  fireEvent.click(screen.getByRole("button", { name: `Ver ${a.filename}` }));
  return within(await screen.findByRole("dialog"));
}

describe("ArchivoVisor", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows a guide inside the platform with Microsoft's viewer, downloading only on request", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: "https://viewer.example/embed" }), { status: 200 }));
    const dialog = await abrir(archivo("Manual de inducción.pdf", "application/pdf"));

    expect(dialog.getByText("Manual de inducción.pdf")).toBeTruthy();
    expect(dialog.getByText("1.2 MB")).toBeTruthy();
    const frame = await dialog.findByTitle("Manual de inducción.pdf");
    expect(frame.getAttribute("src")).toBe("https://viewer.example/embed");
    expect(fetchMock).toHaveBeenCalledWith("/api/aprendizaje/archivo/d1/i1/vista", { cache: "no-store" });

    const descargar = dialog.getByRole("link", { name: /Descargar/ });
    expect(descargar.getAttribute("href")).toBe("/api/aprendizaje/archivo/d1/i1");
    expect(descargar.getAttribute("download")).toBe("Manual de inducción.pdf");
  });

  it("offers the download when the viewer can't show it", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "No se pudo mostrar este archivo aquí. Puedes descargarlo." }), { status: 502 }),
    );
    const dialog = await abrir(archivo("datos.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    expect(await dialog.findByText("No se pudo mostrar este archivo aquí. Puedes descargarlo.")).toBeTruthy();
    expect(dialog.getAllByRole("link", { name: /Descargar/ }).length).toBeGreaterThan(0);
  });

  it("shows images directly, without the online viewer", async () => {
    const dialog = await abrir(archivo("diagrama.png", "image/png"));
    expect(dialog.getByAltText("diagrama.png").getAttribute("src")).toBe("/api/aprendizaje/archivo/d1/i1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains when a file type can't be shown", async () => {
    const dialog = await abrir(archivo("plantillas.zip", "application/zip"));
    expect(dialog.getByText("Este tipo de archivo no se puede ver en la plataforma.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
