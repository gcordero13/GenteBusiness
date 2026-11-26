import { CATEGORY_SHORT_LABELS, type ProximoCurso } from "@/lib/aprendizaje/types";

export function ProximoCard({ curso }: { curso: ProximoCurso }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-dashed bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
          Próximamente
        </span>
        <span className="text-xs text-muted-foreground">{CATEGORY_SHORT_LABELS[curso.category]}</span>
      </div>
      <h3 className="font-bold text-foreground">{curso.title}</h3>
      <p className="text-sm text-muted-foreground">{curso.description || "El área lo está preparando."}</p>
    </article>
  );
}
