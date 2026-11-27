"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, FileQuestion, Loader2, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { archivoUrl, archivoVistaUrl, type LeccionArchivo } from "@/lib/aprendizaje/types";
import { etiquetaArchivo, tamanoArchivo, tipoVisor } from "@/lib/aprendizaje/visor";

/**
 * Opens a lesson file inside the platform (user request, 2026-11-27): guides
 * and materials are seen here and only downloaded when the person chooses
 * "Descargar". Full screen on a phone, a large window on a computer.
 */
export function ArchivoVisor({
  archivo,
  triggerClassName,
  triggerLabel,
  children,
}: {
  archivo: LeccionArchivo;
  triggerClassName: string;
  /** Accessible name of the trigger, e.g. "Ver guia.pdf". */
  triggerLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tipo = tipoVisor(archivo.contentType, archivo.filename);
  const tamano = tamanoArchivo(archivo.sizeBytes);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className={triggerClassName} aria-label={triggerLabel} />}>
        {children}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-[90dvh] sm:max-h-[90dvh] sm:w-[min(72rem,calc(100%-2rem))] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
      >
        <header className="flex items-center gap-3 border-b bg-card px-3 py-2.5 sm:px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#04B1AF]/10 text-[10px] font-bold text-[#036E6C] dark:text-[#5FD6D4]">
            {etiquetaArchivo(archivo.filename)}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{archivo.filename}</DialogTitle>
            {tamano && <p className="text-xs text-muted-foreground">{tamano}</p>}
          </div>
          <a
            href={archivoUrl(archivo)}
            download={archivo.filename}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Descargar</span>
          </a>
          <DialogClose
            render={
              <button
                type="button"
                aria-label="Cerrar"
                className="inline-flex size-9 items-center justify-center rounded-lg border hover:bg-muted"
              />
            }
          >
            <X className="size-4" />
          </DialogClose>
        </header>
        <div className="min-h-0 bg-muted/40">{open && <Contenido archivo={archivo} tipo={tipo} />}</div>
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ archivo, tipo }: { archivo: LeccionArchivo; tipo: ReturnType<typeof tipoVisor> }) {
  if (tipo === "imagen") {
    return (
      <div className="flex size-full items-center justify-center bg-black/90 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL */}
        <img src={archivoUrl(archivo)} alt={archivo.filename} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  if (tipo === "video") {
    return (
      <div className="flex size-full items-center justify-center bg-black">
        <video controls preload="metadata" src={archivoUrl(archivo)} className="max-h-full w-full" />
      </div>
    );
  }
  if (tipo === "audio") {
    return (
      <div className="flex size-full items-center justify-center p-6">
        <audio controls preload="metadata" src={archivoUrl(archivo)} className="w-full max-w-lg" />
      </div>
    );
  }
  if (tipo === "documento") return <VistaDocumento archivo={archivo} />;
  return <SinVista mensaje="Este tipo de archivo no se puede ver en la plataforma." archivo={archivo} />;
}

/** Microsoft's online viewer, embedded: pages, zoom and scrolling, no download. */
function VistaDocumento({ archivo }: { archivo: LeccionArchivo }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(archivoVistaUrl(archivo), { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!res.ok || !body?.url) throw new Error(body?.error ?? "No se pudo mostrar este archivo aquí. Puedes descargarlo.");
        if (!cancelled) setUrl(body.url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo mostrar este archivo aquí.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [archivo]);

  if (error) return <SinVista mensaje={error} archivo={archivo} />;
  if (!url) {
    return (
      <p className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Abriendo {archivo.filename}…
      </p>
    );
  }
  return <iframe src={url} title={archivo.filename} className="size-full border-0 bg-white" allowFullScreen />;
}

function SinVista({ mensaje, archivo }: { mensaje: string; archivo: LeccionArchivo }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileQuestion className="size-10 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">{mensaje}</p>
      <a
        href={archivoUrl(archivo)}
        download={archivo.filename}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#036E6C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#024E4D]"
      >
        <Download className="size-4" />
        Descargar
      </a>
    </div>
  );
}
