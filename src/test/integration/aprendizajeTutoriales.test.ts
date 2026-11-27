import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAprendizajeTestUser, deleteAprendizajeTestUser } from "./aprendizajeTestHelpers";
import type { TestUser } from "./supabaseTestHelpers";

// Fake SharePoint ids: only compared, never fetched.
const DRIVE_ID = `test-drive-${Date.now()}`;
const ITEM_ID = "test-item";

// Tutorials are their own thing (user, 2026-11-27): a name, a module and one
// video or image. Only people with permission on that module see them.
describe("aprendizaje tutorials", () => {
  let manager: TestUser;
  /** Has Planificación but NOT Aprende: still sees Planificación's tutorials. */
  let conModulo: TestUser;
  /** Has Aprende but not Planificación: doesn't see them. */
  let sinModulo: TestUser;
  let tutorialId: string;

  beforeAll(async () => {
    manager = await createAprendizajeTestUser({ canView: true, canManage: true });
    conModulo = await createAprendizajeTestUser({ canView: false, canManage: false }, ["planificacion"]);
    sinModulo = await createAprendizajeTestUser({ canView: true, canManage: false });

    const { data, error } = await manager.client
      .from("aprendizaje_tutoriales")
      .insert({
        title: "Cómo crear un proyecto (test)",
        module_key: "planificacion",
        video_drive_id: DRIVE_ID,
        video_item_id: ITEM_ID,
        created_by: manager.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`insert tutorial: ${error?.message}`);
    tutorialId = data.id;
  }, 90_000);

  afterAll(async () => {
    if (tutorialId) await createAdminClient().from("aprendizaje_tutoriales").delete().eq("id", tutorialId);
    for (const user of [manager, conModulo, sinModulo]) await deleteAprendizajeTestUser(user);
  }, 90_000);

  async function pendientes(user: TestUser) {
    const { data, error } = await user.client.rpc("aprendizaje_tutoriales_pendientes");
    if (error) throw new Error(error.message);
    return (data ?? []) as { tutorial_id: string; module_label: string; video_drive_id: string | null }[];
  }

  async function visible(user: TestUser) {
    const { data, error } = await user.client.rpc("aprendizaje_tutorial_video_visible", {
      p_drive_id: DRIVE_ID,
      p_item_id: ITEM_ID,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async function listado(user: TestUser) {
    const { data } = await user.client.from("aprendizaje_tutoriales").select("id").eq("id", tutorialId);
    return data ?? [];
  }

  it("shows up for people with the module, in the list and as a pop-up", async () => {
    expect((await pendientes(conModulo)).find((t) => t.tutorial_id === tutorialId)).toMatchObject({
      module_label: expect.any(String),
      video_drive_id: DRIVE_ID,
    });
    expect(await listado(conModulo)).toHaveLength(1);
    expect(await visible(conModulo)).toBe(true);
  });

  it("is hidden from people without the module, even with Aprende access", async () => {
    expect((await pendientes(sinModulo)).some((t) => t.tutorial_id === tutorialId)).toBe(false);
    expect(await listado(sinModulo)).toHaveLength(0);
    expect(await visible(sinModulo)).toBe(false);
  });

  it("stops popping up once closed, but stays in the list", async () => {
    expect((await conModulo.client.rpc("aprendizaje_cerrar_tutorial", { p_tutorial_id: tutorialId })).error).toBeNull();
    // Closing twice is harmless.
    expect((await conModulo.client.rpc("aprendizaje_cerrar_tutorial", { p_tutorial_id: tutorialId })).error).toBeNull();
    expect((await pendientes(conModulo)).some((t) => t.tutorial_id === tutorialId)).toBe(false);
    expect(await listado(conModulo)).toHaveLength(1);
    expect(await visible(conModulo)).toBe(true);
  });

  it("disappears for everyone but managers when turned off", async () => {
    const other = await createAprendizajeTestUser({ canView: false, canManage: false }, ["planificacion"]);
    try {
      expect((await pendientes(other)).some((t) => t.tutorial_id === tutorialId)).toBe(true);
      await manager.client.from("aprendizaje_tutoriales").update({ active: false }).eq("id", tutorialId);
      expect((await pendientes(other)).some((t) => t.tutorial_id === tutorialId)).toBe(false);
      expect(await listado(other)).toHaveLength(0);
      expect(await visible(other)).toBe(false);
      expect(await listado(manager)).toHaveLength(1);
    } finally {
      await manager.client.from("aprendizaje_tutoriales").update({ active: true }).eq("id", tutorialId);
      await deleteAprendizajeTestUser(other);
    }
  }, 60_000);

  it("needs exactly one video or image", async () => {
    const { error } = await manager.client
      .from("aprendizaje_tutoriales")
      .insert({ title: "Sin nada (test)", module_key: "planificacion", created_by: manager.id });
    expect(error).not.toBeNull();
  });

  it("only managers create or change tutorials", async () => {
    const { error } = await conModulo.client
      .from("aprendizaje_tutoriales")
      .insert({ title: "X", module_key: "planificacion", video_url: "https://youtu.be/abc" });
    expect(error).not.toBeNull();
    const { data } = await conModulo.client.from("aprendizaje_tutoriales").update({ title: "X" }).eq("id", tutorialId).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("courses no longer take the tutorial category", async () => {
    const { error } = await manager.client
      .from("aprendizaje_cursos")
      .insert({ title: "Curso tutorial (test)", category: "tutorial", created_by: manager.id });
    expect(error).not.toBeNull();
  });
});
