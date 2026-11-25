import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { CATEGORY_LABELS, type CursoCategory } from "@/lib/aprendizaje/types";
import { aprendizajeFlags, listCatalog } from "./actions";
import { CursoCard } from "./CursoCard";

const CATEGORIES: CursoCategory[] = ["curso", "historia"];

export default async function AprendizajePage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { categoria } = await searchParams;
  const category: CursoCategory = categoria === "historia" ? "historia" : "curso";
  const cursos = (await listCatalog()).filter((c) => c.category === category);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Aprendizaje</h1>
            <p className="text-sm text-muted-foreground">Cursos, tutoriales y contenidos de historia.</p>
          </div>
          {flags.canManage && (
            <a
              href="/aprendizaje/gestion"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted"
            >
              <Settings2 className="size-4" />
              Gestión
            </a>
          )}
        </div>

        <nav className="flex gap-1 border-b">
          {CATEGORIES.map((c) => (
            <a
              key={c}
              href={c === "curso" ? "/aprendizaje" : `/aprendizaje?categoria=${c}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                c === category
                  ? "border-[#04B1AF] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </a>
          ))}
        </nav>

        {cursos.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay contenidos publicados aquí.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cursos.map((curso) => (
              <CursoCard key={curso.id} curso={curso} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
