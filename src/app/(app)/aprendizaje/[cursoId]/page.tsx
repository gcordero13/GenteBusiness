import { notFound, redirect } from "next/navigation";
import { aprendizajeFlags, getCuestionariosEstado, getCurso } from "../actions";
import { CursoPortada } from "./CursoPortada";
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

  // No ?leccion= : the course's starting view (what it's about, grade,
  // classes). With it: the player, video at the very top.
  if (!leccion) {
    return (
      <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
        <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
          <CursoPortada curso={curso} cuestionarios={cuestionarios} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="w-full min-w-0 px-4 pt-2 pb-4 sm:px-6 sm:pt-3 sm:pb-6 lg:px-8 lg:pt-4 lg:pb-8">
        <CursoViewer curso={curso} cuestionarios={cuestionarios} initialLeccionId={leccion} />
      </div>
    </div>
  );
}
