"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TutorialPendiente } from "@/lib/aprendizaje/tutoriales";
import { TutorialMedia } from "./aprendizaje/TutorialMedia";
import { cerrarTutorial } from "./actions";

/**
 * A module's tutorial, popped up when the platform opens for people with
 * permission on that module: its video or image. Closing it (button, X or
 * Esc; not a click outside) records it so it doesn't come back; the layout
 * then offers the next pending one, if any.
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
    void cerrarTutorial(tutorial.tutorialId).then(() => router.refresh());
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
            Tutorial · {tutorial.moduleLabel}
          </p>
          <DialogTitle className="text-lg font-bold">{tutorial.title}</DialogTitle>
        </DialogHeader>
        <TutorialMedia tutorial={tutorial} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {canViewAprendizaje && (
            <Link
              href="/aprendizaje?categoria=tutorial#catalogo"
              onClick={close}
              className="inline-flex h-9 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            >
              Ver todos los tutoriales
            </Link>
          )}
          <Button onClick={close}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
