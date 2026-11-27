"use client";

import { useState } from "react";
import { ImageIcon, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { archivoUrl, type Tutorial } from "@/lib/aprendizaje/types";
import { tieneVideo } from "@/lib/aprendizaje/tutoriales";
import { TutorialMedia } from "./TutorialMedia";

/** Aprende's "Tutoriales" tab: the tutorials of the modules this person has; each opens in a window. */
export function TutorialesCatalogo({ tutoriales }: { tutoriales: Tutorial[] }) {
  const [abierto, setAbierto] = useState<Tutorial | null>(null);

  if (tutoriales.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No hay tutoriales de los módulos que tienes asignados.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {tutoriales.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAbierto(t)}
            className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="relative flex aspect-video items-center justify-center bg-[#0B2545] text-white">
              {!tieneVideo(t) && t.imagen ? (
                // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
                <img src={archivoUrl(t.imagen)} alt="" className="size-full object-cover" />
              ) : (
                <PlayCircle className="size-12 opacity-90 transition-transform group-hover:scale-110" />
              )}
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium">
                {tieneVideo(t) ? <PlayCircle className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                {tieneVideo(t) ? "Video" : "Imagen"}
              </span>
            </span>
            <span className="flex flex-col gap-1 p-4">
              <span className="text-xs font-semibold tracking-wide text-[#036E6C] uppercase dark:text-[#5FD6D4]">
                {t.moduleLabel}
              </span>
              <span className="font-semibold text-foreground group-hover:text-[#036E6C] dark:group-hover:text-[#5FD6D4]">{t.title}</span>
            </span>
          </button>
        ))}
      </div>

      <Dialog open={abierto !== null} onOpenChange={(open) => !open && setAbierto(null)}>
        <DialogContent className="top-1/2 max-h-[92dvh] -translate-y-1/2 overflow-y-auto sm:max-w-3xl">
          {abierto && (
            <>
              <DialogHeader>
                <p className="text-xs font-semibold tracking-wide text-[#036E6C] uppercase dark:text-[#5FD6D4]">
                  Tutorial · {abierto.moduleLabel}
                </p>
                <DialogTitle className="text-lg font-bold">{abierto.title}</DialogTitle>
              </DialogHeader>
              <TutorialMedia tutorial={abierto} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
