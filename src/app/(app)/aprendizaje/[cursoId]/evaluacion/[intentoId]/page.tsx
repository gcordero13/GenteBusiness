import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { nextLeccionId } from "@/lib/aprendizaje/mapCurso";
import { aprendizajeFlags, getCurso, getIntento } from "../../../actions";
import { EvaluacionForm } from "./EvaluacionForm";

export default async function EvaluacionPage({
  params,
}: {
  params: Promise<{ cursoId: string; intentoId: string }>;
}) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { cursoId, intentoId } = await params;
  const [curso, intento] = await Promise.all([getCurso(cursoId), getIntento(intentoId)]);
  // getIntento only resolves the caller's own attempts.
  if (!curso || !intento || intento.cursoId !== cursoId) notFound();
  const leccion = curso.lecciones.find((l) => l.id === intento.leccionId) ?? null;

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <Link
          href={leccion ? `/aprendizaje/${cursoId}?leccion=${leccion.id}` : `/aprendizaje/${cursoId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a la lección
        </Link>
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-[#04B1AF] uppercase">Cuestionario · {curso.title}</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{leccion?.title ?? curso.title}</h1>
          <p className="text-sm text-muted-foreground">
            Responde todas las preguntas.
            {leccion?.quiz && ` Esta lección vale ${leccion.quiz.weight}% de la nota del curso.`}
          </p>
        </div>
        <EvaluacionForm
          cursoId={cursoId}
          intento={intento}
          passingScore={curso.evaluacion.passingScore}
          siguienteLeccionId={leccion ? nextLeccionId(curso.lecciones, leccion.id) : null}
        />
      </div>
    </div>
  );
}
