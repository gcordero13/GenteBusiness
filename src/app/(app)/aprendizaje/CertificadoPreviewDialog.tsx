"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { certificadoUrl } from "@/lib/aprendizaje/types";

const PDFJS_WORKER = "https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";
/** Rendered once at this pixel width; CSS scales it down to fit any screen. */
const RENDER_WIDTH = 1600;

/**
 * "Ver certificado": opens the real PDF (same route as the download) drawn
 * into a canvas, so what people see is exactly what they download and it
 * fits a phone screen. The download button lives inside the modal too.
 */
export function CertificadoPreviewDialog({
  cursoId,
  cursoTitle,
  triggerClassName,
}: {
  cursoId: string;
  cursoTitle: string;
  triggerClassName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className={triggerClassName} />}>
        <Eye className="size-4" />
        Ver certificado
      </DialogTrigger>
      <DialogContent className="top-1/2 max-h-[92dvh] -translate-y-1/2 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Tu certificado</DialogTitle>
          <DialogDescription>{cursoTitle}</DialogDescription>
        </DialogHeader>
        {open && <CertificadoCanvas cursoId={cursoId} />}
        <a
          href={certificadoUrl(cursoId)}
          download
          className="inline-flex items-center justify-center gap-1.5 justify-self-start rounded-lg bg-[#036E6C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#024E4D]"
        >
          <Download className="size-4" />
          Descargar PDF
        </a>
      </DialogContent>
    </Dialog>
  );
}

function CertificadoCanvas({ cursoId }: { cursoId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(certificadoUrl(cursoId), { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "No se pudo cargar el certificado.");
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar el certificado.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursoId]);

  return (
    <div className="relative min-w-0">
      {status === "loading" && (
        <p className="flex aspect-[11/8.5] w-full items-center justify-center gap-2 rounded-lg border bg-muted/40 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Preparando tu certificado…
        </p>
      )}
      {status === "error" && <p className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
      <canvas
        ref={canvasRef}
        aria-label="Vista previa del certificado"
        role="img"
        className={status === "ready" ? "block h-auto w-full rounded-lg border shadow-sm" : "hidden"}
      />
    </div>
  );
}
