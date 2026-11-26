import { describe, expect, it } from "vitest";
import { toTutorialPendiente, type RawTutorialPendiente } from "./tutoriales";

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
    });
  });

  it("maps a video link", () => {
    const t = toTutorialPendiente({ ...RAW, video_url: "https://youtu.be/abc", video_drive_id: null, video_item_id: null });
    expect([t.videoUrl, t.videoFile]).toEqual(["https://youtu.be/abc", null]);
  });
});
