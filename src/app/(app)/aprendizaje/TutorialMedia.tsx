import { archivoUrl, type DriveFileRef } from "@/lib/aprendizaje/types";
import { tieneVideo } from "@/lib/aprendizaje/tutoriales";
import { LeccionVideo } from "./[cursoId]/LeccionContent";

/** A tutorial's one thing to show: its video (file or link) or its image. */
export function TutorialMedia({
  tutorial,
}: {
  tutorial: { title: string; videoUrl: string | null; videoFile: DriveFileRef | null; imagen: DriveFileRef | null };
}) {
  if (tieneVideo(tutorial)) {
    return <LeccionVideo leccion={{ title: tutorial.title, videoUrl: tutorial.videoUrl, videoFile: tutorial.videoFile }} />;
  }
  if (!tutorial.imagen) return null;
  return (
    <div className="flex max-h-[65dvh] justify-center overflow-hidden rounded-xl bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL */}
      <img src={archivoUrl(tutorial.imagen)} alt={tutorial.title} className="max-h-[65dvh] w-auto max-w-full object-contain" />
    </div>
  );
}
