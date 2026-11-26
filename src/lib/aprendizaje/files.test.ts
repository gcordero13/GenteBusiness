import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, MAX_FIRMA_BYTES, MAX_VIDEO_BYTES, validateUpload } from "./files";

describe("validateUpload", () => {
  it("accepts valid files", () => {
    expect(validateUpload("video", { size: 10, type: "video/mp4" })).toBeNull();
    expect(validateUpload("portada", { size: 10, type: "image/png" })).toBeNull();
    expect(validateUpload("archivo", { size: 10, type: "application/pdf" })).toBeNull();
    expect(validateUpload("archivo", { size: 10, type: "" })).toBeNull();
    expect(validateUpload("firma", { size: 10, type: "image/png" })).toBeNull();
    expect(validateUpload("firma", { size: 10, type: "image/jpeg" })).toBeNull();
  });

  it.each<[Parameters<typeof validateUpload>[0], { size: number; type: string }, string]>([
    ["archivo", { size: 0, type: "application/pdf" }, "El archivo está vacío."],
    ["video", { size: 10, type: "video/x-msvideo" }, "El video debe ser MP4, WebM o MOV."],
    ["video", { size: MAX_VIDEO_BYTES + 1, type: "video/mp4" }, "El video no puede pesar más de 2 GB."],
    ["portada", { size: 10, type: "application/pdf" }, "La portada debe ser una imagen JPG, PNG, WebP o GIF."],
    ["portada", { size: MAX_FILE_BYTES + 1, type: "image/png" }, "El archivo no puede pesar más de 100 MB."],
    ["archivo", { size: MAX_FILE_BYTES + 1, type: "application/pdf" }, "El archivo no puede pesar más de 100 MB."],
    // The certificate PDF can only embed PNG/JPG signatures.
    ["firma", { size: 10, type: "image/webp" }, "La firma debe ser una imagen PNG o JPG."],
    ["firma", { size: MAX_FIRMA_BYTES + 1, type: "image/png" }, "La firma no puede pesar más de 5 MB."],
  ])("rejects %s %j", (kind, file, error) => {
    expect(validateUpload(kind, file)).toBe(error);
  });
});
