import Link from "next/link";
import { redirect } from "next/navigation";
import { splitMisCursos, siguientePaso } from "@/lib/aprendizaje/portada";
import { CATALOG_TABS, type CatalogTab } from "@/lib/aprendizaje/types";
import { aprendizajeFlags, getMiPerfil, listCatalog, listProximos, listTutoriales } from "./actions";
import { TutorialesCatalogo } from "./TutorialesCatalogo";
import { CursoCard } from "./CursoCard";
import { EnProgresoCard } from "./EnProgresoCard";
import { PortadaBanner } from "./PortadaBanner";
import { ProximoCard } from "./ProximoCard";

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function AprendizajePage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { categoria } = await searchParams;
  const category: CatalogTab = CATALOG_TABS.find((t) => t.key === categoria)?.key ?? "curso";
  const [catalogo, perfil, proximos, tutoriales] = await Promise.all([
    listCatalog(),
    getMiPerfil(),
    listProximos(),
    category === "tutorial" ? listTutoriales() : Promise.resolve([]),
  ]);
  const { enProgreso, completados } = splitMisCursos(catalogo);
  const visibles = catalogo.filter((c) => c.category === category);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-10 p-4 sm:p-6 lg:p-8">
        <PortadaBanner
          perfil={perfil}
          siguientePaso={siguientePaso(enProgreso)}
          stats={{ completados: completados.length, enProgreso: enProgreso.length }}
          certificados={completados}
          canManage={flags.canManage}
        />

        {enProgreso.length > 0 && (
          <Section
            id="en-progreso"
            title="Continúa donde te quedaste"
            aside={
              <span className="text-sm text-muted-foreground">
                {enProgreso.length} {enProgreso.length === 1 ? "curso" : "cursos"} en progreso
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {enProgreso.map((c) => (
                <EnProgresoCard key={c.id} curso={c} />
              ))}
            </div>
          </Section>
        )}

        {proximos.length > 0 && (
          <Section id="proximamente" title="Próximamente">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {proximos.map((p) => (
                <ProximoCard key={p.id} curso={p} />
              ))}
            </div>
          </Section>
        )}

        <Section
          id="catalogo"
          title="Explora el catálogo"
          aside={
            <nav aria-label="Categorías" className="flex flex-wrap gap-2">
              {CATALOG_TABS.map((t) => (
                <Link
                  key={t.key}
                  href={t.key === "curso" ? "/aprendizaje#catalogo" : `/aprendizaje?categoria=${t.key}#catalogo`}
                  aria-current={t.key === category ? "page" : undefined}
                  className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold ${
                    t.key === category ? "bg-[#036E6C] text-white" : "border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          }
        >
          {category === "tutorial" ? (
            <TutorialesCatalogo tutoriales={tutoriales} />
          ) : visibles.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay contenidos publicados aquí.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibles.map((curso) => (
                <CursoCard key={curso.id} curso={curso} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
