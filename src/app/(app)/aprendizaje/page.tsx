import Link from "next/link";
import { redirect } from "next/navigation";
import { splitMisCursos, siguientePaso } from "@/lib/aprendizaje/portada";
import { CATEGORY_LABELS, type CursoCategory } from "@/lib/aprendizaje/types";
import { aprendizajeFlags, getMiPerfil, listCatalog, listProximos } from "./actions";
import { CertificadoCard } from "./CertificadoCard";
import { CursoCard } from "./CursoCard";
import { EnProgresoCard } from "./EnProgresoCard";
import { PortadaBanner } from "./PortadaBanner";
import { ProximoCard } from "./ProximoCard";

const CATEGORIES: CursoCategory[] = ["curso", "historia"];

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
  const category: CursoCategory = categoria === "historia" ? "historia" : "curso";
  const [catalogo, perfil, proximos] = await Promise.all([listCatalog(), getMiPerfil(), listProximos()]);
  const { enProgreso, completados } = splitMisCursos(catalogo);
  const visibles = catalogo.filter((c) => c.category === category);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="mx-auto w-full max-w-7xl min-w-0 space-y-10 p-4 sm:p-6 lg:p-8">
        <PortadaBanner
          perfil={perfil}
          siguientePaso={siguientePaso(enProgreso)}
          stats={{ completados: completados.length, enProgreso: enProgreso.length, certificados: completados.length }}
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {enProgreso.map((c) => (
                <EnProgresoCard key={c.id} curso={c} />
              ))}
            </div>
          </Section>
        )}

        <Section
          id="certificados"
          title="Mis certificados"
          aside={<span className="text-sm text-muted-foreground">Descarga en PDF próximamente</span>}
        >
          {completados.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {completados.map((c) => (
                <CertificadoCard key={c.id} curso={c} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Completa un curso para obtener tu primer certificado.
            </p>
          )}
        </Section>

        {proximos.length > 0 && (
          <Section id="proximamente" title="Próximamente">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              {CATEGORIES.map((c) => (
                <Link
                  key={c}
                  href={c === "curso" ? "/aprendizaje#catalogo" : `/aprendizaje?categoria=${c}#catalogo`}
                  aria-current={c === category ? "page" : undefined}
                  className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold ${
                    c === category ? "bg-[#036E6C] text-white" : "border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </Link>
              ))}
            </nav>
          }
        >
          {visibles.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay contenidos publicados aquí.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
