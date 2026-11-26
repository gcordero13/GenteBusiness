import type { DriveFileRef } from "./types";

/** A module tutorial waiting to pop up for the signed-in person. */
export interface TutorialPendiente {
  cursoId: string;
  title: string;
  description: string | null;
  moduleLabel: string;
  leccionTitle: string;
  videoUrl: string | null;
  videoFile: DriveFileRef | null;
}

/** A row of aprendizaje_tutoriales_pendientes(). */
export interface RawTutorialPendiente {
  curso_id: string;
  title: string;
  description: string | null;
  module_key: string;
  module_label: string;
  leccion_title: string;
  video_url: string | null;
  video_drive_id: string | null;
  video_item_id: string | null;
}

export function toTutorialPendiente(raw: RawTutorialPendiente): TutorialPendiente {
  return {
    cursoId: raw.curso_id,
    title: raw.title,
    description: raw.description,
    moduleLabel: raw.module_label,
    leccionTitle: raw.leccion_title,
    videoUrl: raw.video_url,
    videoFile:
      raw.video_drive_id && raw.video_item_id ? { driveId: raw.video_drive_id, itemId: raw.video_item_id } : null,
  };
}
