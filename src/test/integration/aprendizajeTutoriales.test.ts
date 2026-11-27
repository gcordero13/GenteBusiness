import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAprendizajeTestUser, deleteAprendizajeTestUser } from "./aprendizajeTestHelpers";
import type { TestUser } from "./supabaseTestHelpers";

// Fake SharePoint ids: only compared, never fetched.
const DRIVE_ID = `test-drive-${Date.now()}`;
const ITEM_ID = "test-item";

describe("aprendizaje module tutorials (login pop-up)", () => {
  let manager: TestUser;
  /** Has Planificación but NOT Aprendizaje: still gets the tutorial. */
  let conModulo: TestUser;
  /** Has Aprendizaje but not Planificación: doesn't get it. */
  let sinModulo: TestUser;
  let cursoId: string;

  beforeAll(async () => {
    manager = await createAprendizajeTestUser({ canView: true, canManage: true });
    conModulo = await createAprendizajeTestUser({ canView: false, canManage: false }, ["planificacion"]);
    sinModulo = await createAprendizajeTestUser({ canView: true, canManage: false });

    const db = manager.client;
    const { data: curso, error } = await db
      .from("aprendizaje_cursos")
      .insert({
        title: "Tutorial de Planificación (test)",
        category: "tutorial",
        created_by: manager.id,
        status: "publicado",
        tutorial_module_key: "planificacion",
        anunciar_al_iniciar: true,
      })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoId = curso.id;

    const { error: lError } = await db.from("aprendizaje_lecciones").insert([
      { curso_id: cursoId, position: 0, title: "Sin video" },
      { curso_id: cursoId, position: 1, title: "Introducción", video_drive_id: DRIVE_ID, video_item_id: ITEM_ID },
    ]);
    if (lError) throw new Error(`insert lecciones: ${lError.message}`);
  }, 90_000);

  afterAll(async () => {
    const admin = createAdminClient();
    if (cursoId) await admin.from("aprendizaje_cursos").delete().eq("id", cursoId);
    for (const user of [manager, conModulo, sinModulo]) {
      await deleteAprendizajeTestUser(user);
    }
  }, 90_000);

  async function pendientes(user: TestUser) {
    const { data, error } = await user.client.rpc("aprendizaje_tutoriales_pendientes");
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      curso_id: string;
      module_label: string | null;
      leccion_title: string;
      video_drive_id: string | null;
      imagen_drive_id: string | null;
    }[];
  }

  async function videoVisible(user: TestUser) {
    const { data, error } = await user.client.rpc("aprendizaje_tutorial_video_visible", {
      p_drive_id: DRIVE_ID,
      p_item_id: ITEM_ID,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  it("pops up for people with the module, with the first lesson that has a video", async () => {
    const mine = (await pendientes(conModulo)).find((t) => t.curso_id === cursoId);
    expect(mine).toMatchObject({ module_label: expect.any(String), leccion_title: "Introducción", video_drive_id: DRIVE_ID });
    expect(await videoVisible(conModulo)).toBe(true);
  });

  it("doesn't pop up for people without the module", async () => {
    expect((await pendientes(sinModulo)).some((t) => t.curso_id === cursoId)).toBe(false);
    expect(await videoVisible(sinModulo)).toBe(false);
  });

  it("stops popping up once closed, but the video stays watchable", async () => {
    const { error } = await conModulo.client.rpc("aprendizaje_cerrar_tutorial", { p_curso_id: cursoId });
    expect(error).toBeNull();
    // Closing twice is harmless.
    expect((await conModulo.client.rpc("aprendizaje_cerrar_tutorial", { p_curso_id: cursoId })).error).toBeNull();

    expect((await pendientes(conModulo)).some((t) => t.curso_id === cursoId)).toBe(false);
    expect(await videoVisible(conModulo)).toBe(true);
  });

  it("doesn't announce it once the course isn't published or the option is off", async () => {
    const other = await createAprendizajeTestUser({ canView: false, canManage: false }, ["planificacion"]);
    try {
      expect((await pendientes(other)).some((t) => t.curso_id === cursoId)).toBe(true);
      await manager.client.from("aprendizaje_cursos").update({ anunciar_al_iniciar: false }).eq("id", cursoId);
      expect((await pendientes(other)).some((t) => t.curso_id === cursoId)).toBe(false);
      expect(await videoVisible(other)).toBe(false);
    } finally {
      await manager.client.from("aprendizaje_cursos").update({ anunciar_al_iniciar: true }).eq("id", cursoId);
      await deleteAprendizajeTestUser(other);
    }
  }, 60_000);

  it("only pops up content of the Tutoriales category", async () => {
    try {
      await manager.client.from("aprendizaje_cursos").update({ category: "curso" }).eq("id", cursoId);
      const other = await createAprendizajeTestUser({ canView: false, canManage: false }, ["planificacion"]);
      try {
        expect((await pendientes(other)).some((t) => t.curso_id === cursoId)).toBe(false);
      } finally {
        await deleteAprendizajeTestUser(other);
      }
    } finally {
      await manager.client.from("aprendizaje_cursos").update({ category: "tutorial" }).eq("id", cursoId);
    }
  }, 60_000);

  // A tutorial that explains no module goes to everyone with Aprende access;
  // without a video it shows its image (here, its cover).
  it("pops a general tutorial up for Aprende users, with its image when it has no video", async () => {
    const COVER = `test-cover-${Date.now()}`;
    const { data: general, error } = await manager.client
      .from("aprendizaje_cursos")
      .insert({
        title: "Tutorial general (test)",
        category: "tutorial",
        created_by: manager.id,
        status: "publicado",
        anunciar_al_iniciar: true,
        cover_drive_id: COVER,
        cover_item_id: "cover-item",
      })
      .select("id")
      .single();
    if (error || !general) throw new Error(`insert general: ${error?.message}`);
    try {
      const mio = (await pendientes(sinModulo)).find((t) => t.curso_id === general.id);
      expect(mio).toMatchObject({ module_label: null, video_drive_id: null, imagen_drive_id: COVER });
      const { data: visible } = await sinModulo.client.rpc("aprendizaje_tutorial_video_visible", {
        p_drive_id: COVER,
        p_item_id: "cover-item",
      });
      expect(visible).toBe(true);
      // Someone without Aprende access doesn't get a general tutorial.
      expect((await pendientes(conModulo)).some((t) => t.curso_id === general.id)).toBe(false);
    } finally {
      await createAdminClient().from("aprendizaje_cursos").delete().eq("id", general.id);
    }
  }, 60_000);

  it("only managers can tag a course as a tutorial", async () => {
    const { data } = await sinModulo.client
      .from("aprendizaje_cursos")
      .update({ tutorial_module_key: null })
      .eq("id", cursoId)
      .select("id");
    expect(data ?? []).toEqual([]);
  });
});
