import { describe, expect, it } from "vitest";
import { tieneVideo, toTutorialPendiente, type RawTutorialPendiente } from "./tutoriales";

const RAW: RawTutorialPendiente = {
  curso_id: "c1",
  title: "Cómo usar Planificación",
  description: "Tareas y proyectos",
  module_key: "planificacion",
  module_label: "Planificación",
  leccion_title: "Introducción",
  video_url: null,
  video_drive_id: "d1",
  video_item_id: "i1",
  imagen_drive_id: null,
  imagen_item_id: null,
};

describe("toTutorialPendiente", () => {
  it("maps an uploaded video", () => {
    expect(toTutorialPendiente(RAW)).toEqual({
      cursoId: "c1",
      title: "Cómo usar Planificación",
      description: "Tareas y proyectos",
      moduleLabel: "Planificación",
      leccionTitle: "Introducción",
      videoUrl: null,
      videoFile: { driveId: "d1", itemId: "i1" },
      imagen: null,
    });
    expect(tieneVideo(toTutorialPendiente(RAW))).toBe(true);
  });

  it("maps a video link", () => {
    const t = toTutorialPendiente({ ...RAW, video_url: "https://youtu.be/abc", video_drive_id: null, video_item_id: null });
    expect([t.videoUrl, t.videoFile]).toEqual(["https://youtu.be/abc", null]);
  });

  it("maps a general tutorial (no module) that only has an image", () => {
    const t = toTutorialPendiente({
      ...RAW,
      module_key: null,
      module_label: null,
      video_drive_id: null,
      video_item_id: null,
      imagen_drive_id: "d9",
      imagen_item_id: "i9",
    });
    expect(t.moduleLabel).toBeNull();
    expect(t.imagen).toEqual({ driveId: "d9", itemId: "i9" });
    expect(tieneVideo(t)).toBe(false);
  });
});
