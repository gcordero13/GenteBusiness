import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("aprendizaje evaluations", () => {
  let manager: TestUser;
  let learner: TestUser;
  const cursoIds: string[] = [];

  beforeAll(async () => {
    manager = await createTestUser("Super Admin");
    learner = await createTestUser("Viewer");
  }, 60_000);

  afterAll(async () => {
    const admin = createAdminClient();
    if (cursoIds.length > 0) await admin.from("aprendizaje_cursos").delete().in("id", cursoIds);
    for (const user of [manager, learner]) {
      if (user) await deleteTestUser(user.id);
    }
  }, 60_000);

  /** Published course with one lesson and `questionCount` questions whose FIRST option is correct. */
  async function createCursoConEvaluacion(opts: { questionCount: number; perAttempt: number; maxAttempts?: number }) {
    const db = manager.client;
    const { data: curso, error } = await db
      .from("aprendizaje_cursos")
      .insert({
        title: "Curso evaluado",
        category: "curso",
        created_by: manager.id,
        eval_questions_per_attempt: opts.perAttempt,
        eval_passing_score: 70,
        eval_max_attempts: opts.maxAttempts ?? null,
      })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoIds.push(curso.id);

    const { data: leccion, error: leccionError } = await db
      .from("aprendizaje_lecciones")
      .insert({ curso_id: curso.id, position: 0, title: "Única" })
      .select("id")
      .single();
    if (leccionError || !leccion) throw new Error(`insert leccion: ${leccionError?.message}`);

    const correctByPregunta = new Map<string, string>();
    for (let i = 0; i < opts.questionCount; i++) {
      const { data: pregunta, error: pError } = await db
        .from("aprendizaje_preguntas")
        .insert({ curso_id: curso.id, text: `Pregunta ${i + 1}`, type: "opcion_unica", position: i })
        .select("id")
        .single();
      if (pError || !pregunta) throw new Error(`insert pregunta: ${pError?.message}`);
      const { data: opciones, error: oError } = await db
        .from("aprendizaje_opciones")
        .insert([
          { pregunta_id: pregunta.id, text: "Correcta", is_correct: true, position: 0 },
          { pregunta_id: pregunta.id, text: "Incorrecta", is_correct: false, position: 1 },
        ])
        .select("id, is_correct");
      if (oError) throw new Error(`insert opciones: ${oError.message}`);
      correctByPregunta.set(pregunta.id, (opciones ?? []).find((o) => o.is_correct)!.id);
    }

    const { error: publishError } = await db.from("aprendizaje_cursos").update({ status: "publicado" }).eq("id", curso.id);
    if (publishError) throw new Error(`publish: ${publishError.message}`);
    return { cursoId: curso.id as string, leccionId: leccion.id as string, correctByPregunta };
  }

  it("never lets a learner read the question bank", async () => {
    const { cursoId } = await createCursoConEvaluacion({ questionCount: 2, perAttempt: 2 });
    const { data: preguntas } = await learner.client.from("aprendizaje_preguntas").select("id").eq("curso_id", cursoId);
    expect(preguntas).toEqual([]);
    const { data: opciones } = await learner.client.from("aprendizaje_opciones").select("id, is_correct").limit(1);
    expect(opciones).toEqual([]);
  });

  it("requires all lessons before starting", async () => {
    const { cursoId } = await createCursoConEvaluacion({ questionCount: 2, perAttempt: 2 });
    const { error } = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(error?.message).toContain("Primero completa todas las lecciones");
  });

  it("draws N questions without answers, grades them and completes the course", async () => {
    const { cursoId, leccionId, correctByPregunta } = await createCursoConEvaluacion({ questionCount: 3, perAttempt: 2 });
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionId });

    // Lessons done but evaluation not passed yet: not completed.
    let { data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single();
    expect(inscripcion?.completed_at).toBeNull();

    const { data: intentoId, error: startError } = await learner.client.rpc("aprendizaje_iniciar_intento", {
      p_curso_id: cursoId,
    });
    expect(startError).toBeNull();

    const again = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(again.data).toBe(intentoId);

    const { data: preguntas } = await learner.client.rpc("aprendizaje_preguntas_intento", { p_intento_id: intentoId });
    expect(preguntas).toHaveLength(2);
    for (const p of preguntas as { id: string; options: Record<string, unknown>[] }[]) {
      expect(p.options).toHaveLength(2);
      for (const o of p.options) expect(o).not.toHaveProperty("is_correct");
    }

    const answers = Object.fromEntries(
      (preguntas as { id: string }[]).map((p) => [p.id, correctByPregunta.get(p.id)!]),
    );
    const { data: resultado, error: submitError } = await learner.client.rpc("aprendizaje_enviar_intento", {
      p_intento_id: intentoId,
      p_answers: answers,
    });
    expect(submitError).toBeNull();
    expect(resultado).toEqual({ score: 100, passed: true, correct: 2, total: 2 });

    ({ data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single());
    expect(inscripcion?.completed_at).not.toBeNull();

    const afterPass = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(afterPass.error?.message).toContain("Ya aprobaste esta evaluación");

    const resubmit = await learner.client.rpc("aprendizaje_enviar_intento", { p_intento_id: intentoId, p_answers: answers });
    expect(resubmit.error?.message).toContain("Este intento ya fue enviado");
  });

  it("fails below the passing score and enforces the attempt limit", async () => {
    const { cursoId, leccionId } = await createCursoConEvaluacion({ questionCount: 2, perAttempt: 2, maxAttempts: 1 });
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionId });

    const { data: intentoId } = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    const { data: resultado } = await learner.client.rpc("aprendizaje_enviar_intento", {
      p_intento_id: intentoId,
      p_answers: {},
    });
    expect(resultado).toEqual({ score: 0, passed: false, correct: 0, total: 2 });

    const { data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single();
    expect(inscripcion?.completed_at).toBeNull();

    const { error } = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(error?.message).toContain("Ya usaste todos tus intentos");
  });

  it("keeps attempts write-protected and private", async () => {
    const { cursoId } = await createCursoConEvaluacion({ questionCount: 1, perAttempt: 1 });
    const { error } = await learner.client
      .from("aprendizaje_intentos")
      .insert({ curso_id: cursoId, app_user_id: learner.id, questions: [], score: 100, passed: true });
    expect(error).not.toBeNull();
  });
});
