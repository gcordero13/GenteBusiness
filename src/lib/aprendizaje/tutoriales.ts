import type { DriveFileRef } from "./types";

/** A tutorial waiting to pop up for the signed-in person when the platform opens. */
export interface TutorialPendiente {
  cursoId: string;
  title: string;
  description: string | null;
  /** The module it explains ("Proyectos"), or null for a general tutorial. */
  moduleLabel: string | null;
  leccionTitle: string;
  videoUrl: string | null;
  videoFile: DriveFileRef | null;
  /** Shown when the tutorial has no video: its first lesson image, else its cover. */
  imagen: DriveFileRef | null;
}

/** A row of aprendizaje_tutoriales_pendientes(). */
export interface RawTutorialPendiente {
  curso_id: string;
  title: string;
  description: string | null;
  module_key: string | null;
  module_label: string | null;
  leccion_title: string;
  video_url: string | null;
  video_drive_id: string | null;
  video_item_id: string | null;
  imagen_drive_id?: string | null;
  imagen_item_id?: string | null;
}

const ref = (driveId: string | null | undefined, itemId: string | null | undefined): DriveFileRef | null =>
  driveId && itemId ? { driveId, itemId } : null;

export function toTutorialPendiente(raw: RawTutorialPendiente): TutorialPendiente {
  return {
    cursoId: raw.curso_id,
    title: raw.title,
    description: raw.description,
    moduleLabel: raw.module_label ?? null,
    leccionTitle: raw.leccion_title,
    videoUrl: raw.video_url,
    videoFile: ref(raw.video_drive_id, raw.video_item_id),
    imagen: ref(raw.imagen_drive_id, raw.imagen_item_id),
  };
}

export function tieneVideo(t: TutorialPendiente): boolean {
  return Boolean(t.videoUrl || t.videoFile);
}
