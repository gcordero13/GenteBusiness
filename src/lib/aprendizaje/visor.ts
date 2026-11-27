/**
 * How a lesson file is shown in the in-platform viewer:
 * - imagen / video / audio: played directly from the permission-checked file route;
 * - documento: Microsoft's online viewer (Graph "preview"), PDF and Office alike;
 * - otro: can't be shown, only downloaded.
 */
export type TipoVisor = "imagen" | "video" | "audio" | "documento" | "otro";

const DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "docm", "dot", "dotx", "rtf", "odt",
  "xls", "xlsx", "xlsm", "xlsb", "csv", "ods",
  "ppt", "pptx", "pptm", "pps", "ppsx", "odp",
  "txt", "md",
]);

const DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.",
  "application/vnd.oasis.opendocument.",
  "application/rtf",
  "text/",
];

function extension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function tipoVisor(contentType: string, filename: string): TipoVisor {
  const type = contentType.toLowerCase();
  if (type.startsWith("image/")) return "imagen";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (DOCUMENT_TYPES.some((t) => type.startsWith(t))) return "documento";
  return DOCUMENT_EXTENSIONS.has(extension(filename)) ? "documento" : "otro";
}

/** Short type label for the file's icon: "PDF", "DOCX"… */
export function etiquetaArchivo(filename: string): string {
  return extension(filename).toUpperCase().slice(0, 4) || "ARCHIVO";
}

export function tamanoArchivo(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
