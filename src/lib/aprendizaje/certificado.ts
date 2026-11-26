import type { DriveFileRef } from "./types";

/** Row returned by the aprendizaje_mi_certificado RPC. */
export interface RawCertificado {
  codigo: string;
  nombre: string;
  curso_title: string;
  completed_at: string;
  firma_nombre: string | null;
  firma_cargo: string | null;
  firma_drive_id: string | null;
  firma_item_id: string | null;
}

/** Everything printed on a course certificate. */
export interface CertificadoData {
  codigo: string;
  nombre: string;
  curso: string;
  completedAt: string;
  firmaNombre: string | null;
  firmaCargo: string | null;
  firmaImagen: DriveFileRef | null;
}

export function toCertificadoData(r: RawCertificado): CertificadoData {
  return {
    codigo: r.codigo,
    nombre: r.nombre,
    curso: r.curso_title,
    completedAt: r.completed_at,
    firmaNombre: r.firma_nombre?.trim() || null,
    firmaCargo: r.firma_cargo?.trim() || null,
    firmaImagen: r.firma_drive_id && r.firma_item_id ? { driveId: r.firma_drive_id, itemId: r.firma_item_id } : null,
  };
}

/** "25 de noviembre de 2026", in the company's time zone (Santo Domingo). */
export function fechaCertificado(iso: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santo_Domingo",
  }).format(new Date(iso));
}

/** Public page the certificate's QR opens. */
export function verificacionUrl(siteUrl: string, codigo: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/certificados/${encodeURIComponent(codigo)}`;
}

/** Largest font size ≤ max (but never below min) at which the text fits maxWidth. */
export function fitFontSize(
  text: string,
  max: number,
  maxWidth: number,
  widthAt: (text: string, size: number) => number,
  min: number,
): number {
  let size = max;
  while (size > min && widthAt(text, size) > maxWidth) size -= 1;
  return size;
}
