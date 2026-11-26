import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAprendizajeTestUser, deleteAprendizajeTestUser } from "./aprendizajeTestHelpers";
import type { TestUser } from "./supabaseTestHelpers";

interface QuizSpec {
  weight: number;
  questionCount: number;
  perAttempt: number;
}

describe("aprendizaje lesson quizzes", () => {
  let manager: TestUser;
  let learner: TestUser;
  const cursoIds: string[] = [];

  beforeAll(async () => {
    manager = await createAprendizajeTestUser({ canView: true, canManage: true });
    learner = await createAprendizajeTestUser({ canView: true, canManage: false });
  }, 60_000);

  afterAll(async () => {
    const admin = createAdminClient();
    if (cursoIds.length > 0) await admin.from("aprendizaje_cursos").delete().in("id", cursoIds);
    for (const user of [manager, learner]) {
      await deleteAprendizajeTestUser(user);
    }
  }, 60_000);

  /**
   * Published course with one lesson per quiz (questions whose FIRST option
   * is correct), plus optionally a plain lesson without a quiz.
   */
  async function createCurso(opts: {
    quizzes: QuizSpec[];
    plainLesson?: boolean;
    passingScore?: number;
    maxAttempts?: number;
  }) {
    const db = manager.client;
    const { data: curso, error } = await db
      .from("aprendizaje_cursos")
      .insert({
        title: "Curso con cuestionarios",
        category: "curso",
        created_by: manager.id,
        eval_passing_score: opts.passingScore ?? 70,
        eval_max_attempts: opts.maxAttempts ?? null,
      })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoIds.push(curso.id);

    const quizLessonIds: string[] = [];
    const correctByPregunta = new Map<string, string>();
    for (const [i, quiz] of opts.quizzes.entries()) {
      const { data: leccion, error: lError } = await db
        .from("aprendizaje_lecciones")
        .insert({
          curso_id: curso.id,
          position: i,
          title: `Lección ${i + 1}`,
          eval_questions_per_attempt: quiz.perAttempt,
          eval_weight: quiz.weight,
        })
        .select("id")
        .single();
      if (lError || !leccion) throw new Error(`insert leccion: ${lError?.message}`);
      quizLessonIds.push(leccion.id);

      for (let q = 0; q < quiz.questionCount; q++) {
        const { data: pregunta, error: pError } = await db
          .from("aprendizaje_preguntas")
          .insert({ curso_id: curso.id, leccion_id: leccion.id, text: `P${q + 1}`, type: "opcion_unica", position: q })
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
    }

    let plainLessonId: string | null = null;
    if (opts.plainLesson) {
      const { data: plain, error: plainError } = await db
        .from("aprendizaje_lecciones")
        .insert({ curso_id: curso.id, position: opts.quizzes.length, title: "Sin cuestionario" })
        .select("id")
        .single();
      if (plainError || !plain) throw new Error(`insert plain leccion: ${plainError?.message}`);
      plainLessonId = plain.id;
    }

    const { error: publishError } = await db.from("aprendizaje_cursos").update({ status: "publicado" }).eq("id", curso.id);
    if (publishError) throw new Error(`publish: ${publishError.message}`);
    return { cursoId: curso.id as string, quizLessonIds, plainLessonId, correctByPregunta };
  }

  async function answerQuiz(leccionId: string, correctByPregunta: Map<string, string>, correct: boolean) {
    const { data: intentoId, error: startError } = await learner.client.rpc("aprendizaje_iniciar_cuestionario", {
      p_leccion_id: leccionId,
    });
    if (startError) throw new Error(`start: ${startError.message}`);
    const { data: preguntas } = await learner.client.rpc("aprendizaje_preguntas_intento", { p_intento_id: intentoId });
    const answers = correct
      ? Object.fromEntries((preguntas as { id: string }[]).map((p) => [p.id, correctByPregunta.get(p.id)!]))
      : {};
    const { data, error } = await learner.client.rpc("aprendizaje_enviar_intento", {
      p_intento_id: intentoId,
      p_answers: answers,
    });
    if (error) throw new Error(`submit: ${error.message}`);
    return data as { score: number; nota_curso: number; curso_completado: boolean; correct: number; total: number };
  }

  async function completedAt(cursoId: string) {
    const { data } = await learner.client.from("aprendizaje_inscripciones").select("completed_at").eq("curso_id", cursoId).maybeSingle();
    return data?.completed_at ?? null;
  }

  it("never lets a learner read the question bank", async () => {
    const { cursoId } = await createCurso({ quizzes: [{ weight: 100, questionCount: 2, perAttempt: 2 }] });
    const { data: preguntas } = await learner.client.from("aprendizaje_preguntas").select("id").eq("curso_id", cursoId);
    expect(preguntas).toEqual([]);
    const { data: opciones } = await learner.client.from("aprendizaje_opciones").select("id, is_correct").limit(1);
    expect(opciones).toEqual([]);
  });

  it("completes a quiz lesson only by answering its quiz", async () => {
    const { quizLessonIds } = await createCurso({ quizzes: [{ weight: 100, questionCount: 1, perAttempt: 1 }] });
    const { error } = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: quizLessonIds[0] });
    expect(error?.message).toContain("Esta lección se completa respondiendo su cuestionario");
  });

  it("draws N questions per lesson without answers and resumes the open attempt", async () => {
    const { quizLessonIds } = await createCurso({ quizzes: [{ weight: 100, questionCount: 3, perAttempt: 2 }] });
    const { data: intentoId } = await learner.client.rpc("aprendizaje_iniciar_cuestionario", { p_leccion_id: quizLessonIds[0] });
    const again = await learner.client.rpc("aprendizaje_iniciar_cuestionario", { p_leccion_id: quizLessonIds[0] });
    expect(again.data).toBe(intentoId);

    const { data: preguntas } = await learner.client.rpc("aprendizaje_preguntas_intento", { p_intento_id: intentoId });
    expect(preguntas).toHaveLength(2);
    for (const p of preguntas as { options: Record<string, unknown>[] }[]) {
      for (const o of p.options) expect(o).not.toHaveProperty("is_correct");
    }
  });

  it("weights each lesson into the course grade and completes the course at the minimum", async () => {
    const { cursoId, quizLessonIds, plainLessonId, correctByPregunta } = await createCurso({
      quizzes: [
        { weight: 40, questionCount: 2, perAttempt: 2 },
        { weight: 60, questionCount: 2, perAttempt: 2 },
      ],
      plainLesson: true,
      passingScore: 70,
    });

    const first = await answerQuiz(quizLessonIds[0], correctByPregunta, true);
    expect(first).toMatchObject({ score: 100, correct: 2, total: 2, nota_curso: 40, curso_completado: false });

    // The quiz marked its lesson as done.
    const { data: progreso } = await learner.client
      .from("aprendizaje_progreso_lecciones")
      .select("leccion_id")
      .eq("leccion_id", quizLessonIds[0]);
    expect(progreso).toHaveLength(1);

    const second = await answerQuiz(quizLessonIds[1], correctByPregunta, true);
    expect(second).toMatchObject({ nota_curso: 100, curso_completado: false }); // the plain lesson is still pending
    expect(await completedAt(cursoId)).toBeNull();

    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: plainLessonId });
    expect(await completedAt(cursoId)).not.toBeNull();

    const afterDone = await learner.client.rpc("aprendizaje_iniciar_cuestionario", { p_leccion_id: quizLessonIds[0] });
    expect(afterDone.error?.message).toContain("Ya completaste este curso");
  });

  it("lets the learner retake a quiz to reach the minimum, using the best score", async () => {
    const { cursoId, quizLessonIds, correctByPregunta } = await createCurso({
      quizzes: [{ weight: 100, questionCount: 2, perAttempt: 2 }],
      passingScore: 70,
      maxAttempts: 2,
    });

    const failed = await answerQuiz(quizLessonIds[0], correctByPregunta, false);
    expect(failed).toMatchObject({ score: 0, nota_curso: 0, curso_completado: false });
    expect(await completedAt(cursoId)).toBeNull();

    const retake = await answerQuiz(quizLessonIds[0], correctByPregunta, true);
    expect(retake).toMatchObject({ score: 100, nota_curso: 100, curso_completado: true });
  });

  it("enforces the attempts per quiz", async () => {
    const { quizLessonIds, correctByPregunta } = await createCurso({
      quizzes: [{ weight: 100, questionCount: 1, perAttempt: 1 }],
      maxAttempts: 1,
    });
    await answerQuiz(quizLessonIds[0], correctByPregunta, false);
    const { error } = await learner.client.rpc("aprendizaje_iniciar_cuestionario", { p_leccion_id: quizLessonIds[0] });
    expect(error?.message).toContain("Ya usaste todos tus intentos de este cuestionario");
  });

  it("keeps attempts write-protected", async () => {
    const { cursoId, quizLessonIds } = await createCurso({ quizzes: [{ weight: 100, questionCount: 1, perAttempt: 1 }] });
    const { error } = await learner.client.from("aprendizaje_intentos").insert({
      curso_id: cursoId,
      leccion_id: quizLessonIds[0],
      app_user_id: learner.id,
      questions: [],
      score: 100,
      passed: true,
    });
    expect(error).not.toBeNull();
  });
});
