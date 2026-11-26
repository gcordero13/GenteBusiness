import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const render_ = vi.fn(() => ({ promise: Promise.resolve() }));
const getDocument = vi.fn();

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

const { CertificadoPreviewDialog } = await import("./CertificadoPreviewDialog");

const fetchMock = vi.fn();

describe("CertificadoPreviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as unknown as HTMLCanvasElement["getContext"];
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({ width: 792 * scale, height: 612 * scale }),
          render: render_,
        }),
      }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const abrir = () => {
    render(<CertificadoPreviewDialog cursoId="c1" cursoTitle="Ciberseguridad" triggerClassName="" />);
    fireEvent.click(screen.getByRole("button", { name: /Ver certificado/ }));
    return screen.findByRole("dialog");
  };

  it("shows the real certificate PDF in the modal, with the download inside", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
    const dialog = await abrir();

    expect(within(dialog).getByText("Tu certificado")).toBeTruthy();
    expect(within(dialog).getByText("Ciberseguridad")).toBeTruthy();
    await waitFor(() => expect(render_).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/aprendizaje/certificado/c1", { cache: "no-store" });
    const canvas = within(dialog).getByRole("img", { name: "Vista previa del certificado" }) as HTMLCanvasElement;
    await waitFor(() => expect(canvas.className).toContain("w-full"));
    // Rendered sharp, then scaled by CSS to fit the screen (phones included).
    expect(canvas.width).toBe(1600);

    const descargar = within(dialog).getByRole("link", { name: /Descargar PDF/ });
    expect(descargar.getAttribute("href")).toBe("/api/aprendizaje/certificado/c1");
  });

  it("explains why when there is no certificate", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Aún no tienes el certificado de este curso." }), { status: 404 }),
    );
    const dialog = await abrir();
    expect(await within(dialog).findByText("Aún no tienes el certificado de este curso.")).toBeTruthy();
    expect(render_).not.toHaveBeenCalled();
  });
});
