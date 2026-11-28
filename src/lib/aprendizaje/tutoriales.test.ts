import { describe, expect, it } from "vitest";
import { tieneVideo, toTutorial, toTutorialPendiente, type RawTutorial, type RawTutorialPendiente } from "./tutoriales";

const PENDIENTE: RawTutorialPendiente = {
  tutorial_id: "t1",
  title: "Cómo crear un proyecto",
  module_key: "planificacion",
  module_label: "Planificación",
  video_url: null,
  video_drive_id: "d1",
  video_item_id: "i1",
  imagen_drive_id: null,
  imagen_item_id: null,
};

describe("toTutorialPendiente", () => {
  it("maps an uploaded video", () => {
    expect(toTutorialPendiente(PENDIENTE)).toEqual({
      tutorialId: "t1",
      title: "Cómo crear un proyecto",
      moduleLabel: "Planificación",
      videoUrl: null,
      videoFile: { driveId: "d1", itemId: "i1" },
      imagen: null,
    });
    expect(tieneVideo(toTutorialPendiente(PENDIENTE))).toBe(true);
  });

  it("maps an image-only tutorial", () => {
    const t = toTutorialPendiente({ ...PENDIENTE, video_drive_id: null, video_item_id: null, imagen_drive_id: "d9", imagen_item_id: "i9" });
    expect(t.imagen).toEqual({ driveId: "d9", itemId: "i9" });
    expect(tieneVideo(t)).toBe(false);
  });
});

describe("toTutorial", () => {
  const RAW: RawTutorial = {
    id: "t1",
    title: "Cómo crear un proyecto",
    module_key: "planificacion",
    video_url: "https://youtu.be/abc",
    video_drive_id: null,
    video_item_id: null,
    imagen_drive_id: null,
    imagen_item_id: null,
    active: true,
    modules: { label: "Planificación" },
  };

  it("maps a video link with its module's name", () => {
    expect(toTutorial(RAW)).toEqual({
      id: "t1",
      title: "Cómo crear un proyecto",
      moduleKey: "planificacion",
      moduleLabel: "Planificación",
      videoUrl: "https://youtu.be/abc",
      videoFile: null,
      imagen: null,
      active: true,
    });
  });

  it("falls back to the module key when its name isn't joined", () => {
    expect(toTutorial({ ...RAW, modules: null }).moduleLabel).toBe("planificacion");
    expect(toTutorial({ ...RAW, modules: [{ label: "Planificación" }] }).moduleLabel).toBe("Planificación");
  });

  it("a tutorial without module is Mi perfil's (seen by everyone)", () => {
    const t = toTutorial({ ...RAW, module_key: null, modules: null });
    expect(t.moduleKey).toBeNull();
    expect(t.moduleLabel).toBe("Mi perfil");
  });
});
