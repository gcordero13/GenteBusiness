import type { DriveFileRef, Tutorial } from "./types";

const ref = (driveId: string | null | undefined, itemId: string | null | undefined): DriveFileRef | null =>
  driveId && itemId ? { driveId, itemId } : null;

/** A row of aprendizaje_tutoriales (with modules(label) joined). */
export interface RawTutorial {
  id: string;
  title: string;
  module_key: string;
  video_url: string | null;
  video_drive_id: string | null;
  video_item_id: string | null;
  imagen_drive_id: string | null;
  imagen_item_id: string | null;
  active: boolean;
  modules?: { label: string } | { label: string }[] | null;
}

export function toTutorial(raw: RawTutorial): Tutorial {
  const mod = Array.isArray(raw.modules) ? raw.modules[0] : raw.modules;
  return {
    id: raw.id,
    title: raw.title,
    moduleKey: raw.module_key,
    moduleLabel: mod?.label ?? raw.module_key,
    videoUrl: raw.video_url,
    videoFile: ref(raw.video_drive_id, raw.video_item_id),
    imagen: ref(raw.imagen_drive_id, raw.imagen_item_id),
    active: raw.active,
  };
}

/** A tutorial waiting to pop up for the signed-in person when the platform opens. */
export interface TutorialPendiente {
  tutorialId: string;
  title: string;
  moduleLabel: string;
  videoUrl: string | null;
  videoFile: DriveFileRef | null;
  imagen: DriveFileRef | null;
}

/** A row of aprendizaje_tutoriales_pendientes(). */
export interface RawTutorialPendiente {
  tutorial_id: string;
  title: string;
  module_key: string;
  module_label: string;
  video_url: string | null;
  video_drive_id: string | null;
  video_item_id: string | null;
  imagen_drive_id: string | null;
  imagen_item_id: string | null;
}

export function toTutorialPendiente(raw: RawTutorialPendiente): TutorialPendiente {
  return {
    tutorialId: raw.tutorial_id,
    title: raw.title,
    moduleLabel: raw.module_label,
    videoUrl: raw.video_url,
    videoFile: ref(raw.video_drive_id, raw.video_item_id),
    imagen: ref(raw.imagen_drive_id, raw.imagen_item_id),
  };
}

export function tieneVideo(t: { videoUrl: string | null; videoFile: DriveFileRef | null }): boolean {
  return Boolean(t.videoUrl || t.videoFile);
}
