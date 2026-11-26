import { notFound, redirect } from "next/navigation";
import { aprendizajeFlags } from "../../actions";
import { getCursoGestion, listModulos, listPreguntas } from "../actions";
import { CursoEditor } from "./CursoEditor";

export default async function CursoGestionPage({ params }: { params: Promise<{ cursoId: string }> }) {
  const flags = await aprendizajeFlags();
  if (!flags.canManage) redirect("/aprendizaje");

  const { cursoId } = await params;
  const [curso, preguntas, modulos] = await Promise.all([
    getCursoGestion(cursoId),
    listPreguntas(cursoId),
    listModulos(),
  ]);
  if (!curso) notFound();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
        {/* key: after router.refresh() the editor's local form state resets to the saved values */}
        <CursoEditor key={curso.id} curso={curso} preguntas={preguntas} modulos={modulos} />
      </div>
    </div>
  );
}
