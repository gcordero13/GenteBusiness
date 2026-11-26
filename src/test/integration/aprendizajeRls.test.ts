import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAprendizajeTestUser, deleteAprendizajeTestUser } from "./aprendizajeTestHelpers";
import type { TestUser } from "./supabaseTestHelpers";

describe("aprendizaje RLS", () => {
  let manager: TestUser;
  let learner: TestUser;
  let otherLearner: TestUser;
  const cursoIds: string[] = [];

  beforeAll(async () => {
    manager = await createAprendizajeTestUser({ canView: true, canManage: true });
    learner = await createAprendizajeTestUser({ canView: true, canManage: false });
    otherLearner = await createAprendizajeTestUser({ canView: true, canManage: false });
  }, 60_000);

  afterAll(async () => {
    const admin = createAdminClient();
    if (cursoIds.length > 0) await admin.from("aprendizaje_cursos").delete().in("id", cursoIds);
    for (const user of [manager, learner, otherLearner]) {
      await deleteAprendizajeTestUser(user);
    }
  }, 60_000);

  async function createCurso(status: "borrador" | "publicado", leccionCount = 2) {
    const { data: curso, error } = await manager.client
      .from("aprendizaje_cursos")
      .insert({ title: "Curso de prueba", category: "curso", created_by: manager.id })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoIds.push(curso.id);

    const { data: lecciones, error: leccionesError } = await manager.client
      .from("aprendizaje_lecciones")
      .insert(Array.from({ length: leccionCount }, (_, i) => ({ curso_id: curso.id, position: i, title: `Lección ${i + 1}` })))
      .select("id, position");
    if (leccionesError) throw new Error(`insert lecciones: ${leccionesError.message}`);
    // Sorted here rather than with .order(): ordering an insert's returned rows isn't reliable in PostgREST.
    lecciones?.sort((a, b) => a.position - b.position);

    if (status === "publicado") {
      const { error: publishError } = await manager.client
        .from("aprendizaje_cursos")
        .update({ status: "publicado" })
        .eq("id", curso.id);
      if (publishError) throw new Error(`publish: ${publishError.message}`);
    }
    return { cursoId: curso.id as string, leccionIds: (lecciones ?? []).map((l) => l.id as string) };
  }

  it("hides draft courses from learners and shows published ones", async () => {
    const draft = await createCurso("borrador");
    const published = await createCurso("publicado");

    const { data } = await learner.client.from("aprendizaje_cursos").select("id").in("id", [draft.cursoId, published.cursoId]);
    expect((data ?? []).map((r) => r.id)).toEqual([published.cursoId]);

    const { data: draftLessons } = await learner.client.from("aprendizaje_lecciones").select("id").eq("curso_id", draft.cursoId);
    expect(draftLessons).toEqual([]);
  });

  it("does not let a learner create courses", async () => {
    const { error } = await learner.client.from("aprendizaje_cursos").insert({ title: "Hack", category: "curso" });
    expect(error).not.toBeNull();
  });

  it("does not let a learner write progress directly", async () => {
    const { leccionIds } = await createCurso("publicado", 1);
    const { error } = await learner.client
      .from("aprendizaje_progreso_lecciones")
      .insert({ leccion_id: leccionIds[0], app_user_id: learner.id });
    expect(error).not.toBeNull();
  });

  it("marks lessons through the RPC and completes the course after the last one", async () => {
    const { cursoId, leccionIds } = await createCurso("publicado", 2);

    const first = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });
    expect(first.error).toBeNull();
    let { data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single();
    expect(inscripcion?.completed_at).toBeNull();

    const second = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[1] });
    expect(second.error).toBeNull();
    ({ data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single());
    expect(inscripcion?.completed_at).not.toBeNull();

    // Marking again is idempotent.
    const again = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[1] });
    expect(again.error).toBeNull();
  });

  it("rejects marking a lesson of a draft course", async () => {
    const { leccionIds } = await createCurso("borrador", 1);
    const { error } = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });
    expect(error?.message).toContain("El curso no está publicado");
  });

  it("keeps each learner's progress private", async () => {
    const { leccionIds } = await createCurso("publicado", 1);
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });

    const { data } = await otherLearner.client
      .from("aprendizaje_progreso_lecciones")
      .select("leccion_id")
      .eq("app_user_id", learner.id);
    expect(data).toEqual([]);

    const { data: managerView } = await manager.client
      .from("aprendizaje_progreso_lecciones")
      .select("leccion_id")
      .eq("app_user_id", learner.id)
      .eq("leccion_id", leccionIds[0]);
    expect(managerView).toHaveLength(1);
  });

  it("lets only managers reorder lessons, atomically", async () => {
    const { cursoId, leccionIds } = await createCurso("borrador", 3);
    const reversed = [...leccionIds].reverse();

    const denied = await learner.client.rpc("aprendizaje_reordenar_lecciones", { p_curso_id: cursoId, p_ids: reversed });
    expect(denied.error?.message).toContain("No autorizado");

    const ok = await manager.client.rpc("aprendizaje_reordenar_lecciones", { p_curso_id: cursoId, p_ids: reversed });
    expect(ok.error).toBeNull();
    const { data } = await manager.client
      .from("aprendizaje_lecciones")
      .select("id")
      .eq("curso_id", cursoId)
      .order("position");
    expect((data ?? []).map((r) => r.id)).toEqual(reversed);
  });
});
