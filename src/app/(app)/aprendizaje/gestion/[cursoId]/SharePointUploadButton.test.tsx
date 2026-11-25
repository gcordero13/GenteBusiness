import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startUpload = vi.fn();
const uploadFileInChunks = vi.fn();

vi.mock("../actions", () => ({ startUpload: (...args: unknown[]) => startUpload(...args) }));
vi.mock("@/lib/aprendizaje/chunkedUpload", () => ({
  uploadFileInChunks: (...args: unknown[]) => uploadFileInChunks(...args),
}));

const { SharePointUploadButton } = await import("./SharePointUploadButton");

function pick(file: File) {
  fireEvent.change(screen.getByTestId("upload-input"), { target: { files: [file] } });
}

describe("SharePointUploadButton", () => {
  beforeEach(() => {
    startUpload.mockReset();
    uploadFileInChunks.mockReset();
  });

  it("opens a session, uploads the file and reports the uploaded item", async () => {
    startUpload.mockResolvedValue({ uploadUrl: "https://upload.example/s" });
    uploadFileInChunks.mockResolvedValue({ driveId: "d1", itemId: "i1" });
    const onUploaded = vi.fn().mockResolvedValue(undefined);
    render(<SharePointUploadButton kind="archivo" label="Agregar archivo" onUploaded={onUploaded} />);

    pick(new File(["hola"], "guia.pdf", { type: "application/pdf" }));

    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({
        driveId: "d1",
        itemId: "i1",
        filename: "guia.pdf",
        contentType: "application/pdf",
        sizeBytes: 4,
      }),
    );
    expect(startUpload).toHaveBeenCalledWith("archivo", { name: "guia.pdf", size: 4, type: "application/pdf" });
    expect(uploadFileInChunks.mock.calls[0][1]).toBe("https://upload.example/s");
  });

  it("rejects an invalid file before contacting the server", async () => {
    const onUploaded = vi.fn();
    render(<SharePointUploadButton kind="video" label="Subir video" onUploaded={onUploaded} />);

    pick(new File(["x"], "video.avi", { type: "video/x-msvideo" }));

    expect(await screen.findByText("El video debe ser MP4, WebM o MOV.")).toBeTruthy();
    expect(startUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("shows server and upload errors", async () => {
    startUpload.mockResolvedValue({ error: "No autorizado" });
    render(<SharePointUploadButton kind="archivo" label="Agregar archivo" onUploaded={vi.fn()} />);

    pick(new File(["hola"], "guia.pdf", { type: "application/pdf" }));

    expect(await screen.findByText("No autorizado")).toBeTruthy();
  });
});
