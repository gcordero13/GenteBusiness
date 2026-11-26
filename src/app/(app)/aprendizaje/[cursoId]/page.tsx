import { notFound, redirect } from "next/navigation";
import { aprendizajeFlags, getCurso, getEvaluacionEstado } from "../actions";
import { CursoViewer } from "./CursoViewer";

export default async function CursoPage({ params }: { params: Promise<{ cursoId: string }> }) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { cursoId } = await params;
  // RLS returns drafts only to managers, so a learner opening a draft's URL gets a 404.
  const curso = await getCurso(cursoId);
  if (!curso) notFound();
  const evaluacion = curso.evaluacion.questionsPerAttempt !== null ? await getEvaluacionEstado(cursoId) : null;

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
        <CursoViewer curso={curso} evaluacion={evaluacion} />
      </div>
    </div>
  );
}
