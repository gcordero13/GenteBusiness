"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { tieneVideo, type TutorialPendiente } from "@/lib/aprendizaje/tutoriales";
import { archivoUrl } from "@/lib/aprendizaje/types";
import { LeccionVideo } from "./aprendizaje/[cursoId]/LeccionContent";
import { cerrarTutorial } from "./actions";

/**
 * Tutorial pop-up shown when the platform opens: its video, or its image when
 * it has none ("Nuevo módulo: X" for a module's tutorial, "Nuevo tutorial"
 * otherwise).
 * Closing it (button, X or Esc; not a click outside) records it so it
 * doesn't come back; the layout then offers the next pending one, if any.
 */
export function TutorialModuloDialog({
  tutorial,
  canViewAprendizaje,
}: {
  tutorial: TutorialPendiente;
  canViewAprendizaje: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function close() {
    setOpen(false);
    void cerrarTutorial(tutorial.cursoId).then(() => router.refresh());
  }

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="top-1/2 max-h-[92dvh] -translate-y-1/2 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#036E6C] uppercase dark:text-[#5FD6D4]">
            <Sparkles className="size-4" />
            {tutorial.moduleLabel ? `Nuevo módulo: ${tutorial.moduleLabel}` : "Nuevo tutorial"}
          </p>
          <DialogTitle className="text-lg font-bold">{tutorial.title}</DialogTitle>
          {tutorial.description && <DialogDescription>{tutorial.description}</DialogDescription>}
        </DialogHeader>
        {tieneVideo(tutorial) ? (
          <LeccionVideo
            leccion={{ title: tutorial.leccionTitle, videoUrl: tutorial.videoUrl, videoFile: tutorial.videoFile }}
          />
        ) : (
          tutorial.imagen && (
            <div className="flex max-h-[60dvh] justify-center overflow-hidden rounded-xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL */}
              <img src={archivoUrl(tutorial.imagen)} alt={tutorial.title} className="max-h-[60dvh] w-auto max-w-full object-contain" />
            </div>
          )
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {canViewAprendizaje && (
            <Link
              href={`/aprendizaje/${tutorial.cursoId}`}
              onClick={close}
              className="inline-flex h-9 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            >
              Ver en Aprende
            </Link>
          )}
          <Button onClick={close}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
