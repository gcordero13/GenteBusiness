export type UploadKind = "video" | "archivo" | "portada" | "firma";

export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
export const MAX_FILE_BYTES = 100 * 1024 ** 2;
export const MAX_FIRMA_BYTES = 5 * 1024 ** 2;

export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** The certificate PDF can only embed PNG and JPG. */
export const FIRMA_TYPES = ["image/png", "image/jpeg"];

/** `accept` attribute for the file input of each kind. */
export const UPLOAD_ACCEPT: Record<UploadKind, string> = {
  video: VIDEO_TYPES.join(","),
  portada: IMAGE_TYPES.join(","),
  firma: FIRMA_TYPES.join(","),
  archivo: "",
};

/** Shared by the browser (before uploading) and the server action that opens the upload session. */
export function validateUpload(kind: UploadKind, file: { size: number; type: string }): string | null {
  if (file.size <= 0) return "El archivo está vacío.";
  if (kind === "video") {
    if (!VIDEO_TYPES.includes(file.type)) return "El video debe ser MP4, WebM o MOV.";
    if (file.size > MAX_VIDEO_BYTES) return "El video no puede pesar más de 2 GB.";
    return null;
  }
  if (kind === "firma") {
    if (!FIRMA_TYPES.includes(file.type)) return "La firma debe ser una imagen PNG o JPG.";
    if (file.size > MAX_FIRMA_BYTES) return "La firma no puede pesar más de 5 MB.";
    return null;
  }
  if (kind === "portada" && !IMAGE_TYPES.includes(file.type)) {
    return "La portada debe ser una imagen JPG, PNG, WebP o GIF.";
  }
  if (file.size > MAX_FILE_BYTES) return "El archivo no puede pesar más de 100 MB.";
  return null;
}
