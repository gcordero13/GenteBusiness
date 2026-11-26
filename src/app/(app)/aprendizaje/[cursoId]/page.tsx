import { notFound, redirect } from "next/navigation";
import { aprendizajeFlags, getCuestionariosEstado, getCurso } from "../actions";
import { CursoViewer } from "./CursoViewer";

export default async function CursoPage({
  params,
  searchParams,
}: {
  params: Promise<{ cursoId: string }>;
  searchParams: Promise<{ leccion?: string }>;
}) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const [{ cursoId }, { leccion }] = await Promise.all([params, searchParams]);
  // RLS returns drafts only to managers, so a learner opening a draft's URL gets a 404.
  const curso = await getCurso(cursoId);
  if (!curso) notFound();
  const cuestionarios = curso.lecciones.some((l) => l.quiz !== null) ? await getCuestionariosEstado(cursoId) : {};

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
        <CursoViewer curso={curso} cuestionarios={cuestionarios} initialLeccionId={leccion} />
      </div>
    </div>
  );
}
