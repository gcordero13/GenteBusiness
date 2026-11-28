"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIRMA_ALTO, FIRMA_ANCHO, FirmaCorreo, type FirmaProps } from "./FirmaCorreo";
import { nombreArchivoFirma } from "./firmaDatos";

/**
 * "Mi firma de correo" in Mi perfil (user request, 2026-11-27): the person's
 * signature in their company's design, with and without photo, to download
 * or copy as an image and paste into Outlook. `propia` = false when someone
 * who manages contacts looks at another person's signature.
 */
export function FirmasCorreo({ propia = true, ...props }: Omit<FirmaProps, "conFoto"> & { propia?: boolean }) {
  const nombreCompleto = `${props.persona.nombre} ${props.persona.apellido}`.trim();
  const tieneFoto = Boolean(props.persona.fotoUrl);
  const [conFoto, setConFoto] = useState(tieneFoto);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const marcoRef = useRef<HTMLDivElement>(null);
  const firmaRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.5);

  // The preview is the real 1004 × 590 signature, scaled to the screen width.
  useEffect(() => {
    const marco = marcoRef.current;
    if (!marco) return;
    const medir = () => setEscala(Math.min(1, marco.clientWidth / FIRMA_ANCHO));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(marco);
    return () => ro.disconnect();
  }, []);

  async function generar(): Promise<Blob> {
    const nodo = firmaRef.current;
    if (!nodo) throw new Error("No se encontró la firma");
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(nodo, { width: FIRMA_ANCHO, height: FIRMA_ALTO, pixelRatio: 1, cacheBust: true });
    if (!blob) throw new Error("No se pudo crear la imagen");
    return blob;
  }

  async function descargar() {
    setAviso(null);
    setOcupado(true);
    try {
      const url = URL.createObjectURL(await generar());
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoFirma(props.persona, conFoto);
      a.click();
      URL.revokeObjectURL(url);
      setAviso({ tipo: "ok", texto: "Firma descargada." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo crear la imagen. Recarga la página e inténtalo de nuevo." });
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    setAviso(null);
    setOcupado(true);
    try {
      const blob = await generar();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setAviso({ tipo: "ok", texto: "Firma copiada. Pégala en Outlook con Ctrl+V." });
    } catch {
      setAviso({ tipo: "error", texto: "Tu navegador no dejó copiar la imagen. Usa «Descargar PNG»." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-labelledby="firma-title" className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="firma-title" className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="size-5 text-[#036E6C] dark:text-[#5FD6D4]" />
            {propia ? "Mi firma de correo" : `Firma de correo de ${nombreCompleto}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {propia
              ? "Se arma con tus datos de la Agenda. Si algo no está bien, corrígelo en el formulario y la firma se actualiza."
              : "Se arma con sus datos de la Agenda. Si algo no está bien, corrígelo en el formulario y la firma se actualiza."}
          </p>
        </div>
        <div role="tablist" aria-label="Versión" className="flex gap-1 rounded-xl border bg-card p-1">
          {[
            { valor: true, label: "Con foto" },
            { valor: false, label: "Sin foto" },
          ].map((v) => (
            <button
              key={v.label}
              type="button"
              role="tab"
              aria-selected={conFoto === v.valor}
              disabled={v.valor && !tieneFoto}
              title={v.valor && !tieneFoto ? (propia ? "Tu contacto no tiene foto" : "Este contacto no tiene foto") : undefined}
              onClick={() => setConFoto(v.valor)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                conFoto === v.valor
                  ? "bg-[#04B1AF]/12 font-semibold text-[#036E6C] dark:bg-[#04B1AF]/20 dark:text-[#5FD6D4]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={marcoRef} className="w-full overflow-hidden rounded-xl border" style={{ height: FIRMA_ALTO * escala }}>
        <div style={{ width: FIRMA_ANCHO, height: FIRMA_ALTO, transform: `scale(${escala})`, transformOrigin: "top left" }}>
          <div ref={firmaRef} role="img" aria-label={`Firma de correo de ${nombreCompleto}`}>
            <FirmaCorreo {...props} conFoto={conFoto} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={descargar} disabled={ocupado} className="gap-1.5 bg-[#036E6C] text-white hover:bg-[#024E4D]">
          <Download className="size-4" />
          Descargar PNG
        </Button>
        <Button variant="outline" onClick={copiar} disabled={ocupado} className="gap-1.5">
          <Copy className="size-4" />
          Copiar imagen
        </Button>
        {aviso && (
          <span className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
            {aviso.texto}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        En Outlook: <b>Configuración › Cuentas › Firmas</b>, crea una firma nueva y pega la imagen (Ctrl+V), o insértala desde
        el archivo descargado.
      </p>
    </section>
  );
}
