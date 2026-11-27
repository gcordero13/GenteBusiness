import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

// Editing a project (2026-11-27): the owner and "Editar" shares change name
// and description; only the creator moves it to another department.
describe("editing a project", () => {
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  const proyectoId = randomUUID();
  let departamentoId: string;

  beforeAll(async () => {
    owner = await createTestUser("Viewer");
    editor = await createTestUser("Viewer");
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();
    const { data: dep, error: depError } = await admin.from("departments").select("id").limit(1).single();
    if (depError || !dep) throw new Error(`department: ${depError?.message}`);
    departamentoId = dep.id;

    const { error } = await owner.client
      .from("plan_proyectos")
      .insert({ id: proyectoId, name: "Proyecto (test)", created_by: owner.id });
    if (error) throw new Error(`insert proyecto: ${error.message}`);
    const { error: shareError } = await admin.from("plan_proyecto_compartidos").insert([
      { proyecto_id: proyectoId, shared_with_app_user_id: editor.id, access_level: "editar", shared_by: owner.id },
      { proyecto_id: proyectoId, shared_with_app_user_id: viewer.id, access_level: "ver", shared_by: owner.id },
    ]);
    if (shareError) throw new Error(`share: ${shareError.message}`);
  }, 90_000);

  afterAll(async () => {
    await createAdminClient().from("plan_proyectos").delete().eq("id", proyectoId);
    for (const u of [owner, editor, viewer]) if (u) await deleteTestUser(u.id);
  }, 90_000);

  const renombrar = (user: TestUser, name: string) =>
    user.client.from("plan_proyectos").update({ name }).eq("id", proyectoId).select("id");

  it("lets the owner and an Editar share rename it", async () => {
    expect((await renombrar(owner, "Renombrado por el dueño")).data).toHaveLength(1);
    expect((await renombrar(editor, "Renombrado por el editor")).data).toHaveLength(1);
  });

  it("doesn't let a Ver share rename it", async () => {
    expect((await renombrar(viewer, "No debería")).data ?? []).toHaveLength(0);
  });

  it("lets only the creator change the department", async () => {
    const { error: editorError } = await editor.client.rpc("plan_set_departamento_proyecto", {
      p_proyecto_id: proyectoId,
      p_departamento_id: departamentoId,
    });
    expect(editorError?.message).toContain("Solo quien creó el proyecto");

    const { error } = await owner.client.rpc("plan_set_departamento_proyecto", {
      p_proyecto_id: proyectoId,
      p_departamento_id: departamentoId,
    });
    expect(error).toBeNull();
    const { data } = await createAdminClient().from("plan_proyectos").select("departamento_id").eq("id", proyectoId).single();
    expect(data?.departamento_id).toBe(departamentoId);

    const { error: clearError } = await owner.client.rpc("plan_set_departamento_proyecto", {
      p_proyecto_id: proyectoId,
      p_departamento_id: null,
    });
    expect(clearError).toBeNull();
  });
});
