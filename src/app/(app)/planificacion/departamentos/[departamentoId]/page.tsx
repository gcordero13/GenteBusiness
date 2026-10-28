import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDepartamento, listProyectosDeDepartamento, type ProyectoListRow } from "../../proyectos/actions";

function ProyectoCard({ proyecto }: { proyecto: ProyectoListRow }) {
  return (
    <Link
      href={`/planificacion/proyectos/${proyecto.id}`}
      className="block rounded-xl border p-3 text-sm transition-colors hover:border-[#04B1AF] hover:bg-[#04B1AF]/5"
    >
      <p className="font-semibold text-foreground">{proyecto.name}</p>
      {proyecto.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{proyecto.description}</p>}
      {!proyecto.isOwner && <p className="mt-1 text-[11px] text-muted-foreground">Compartido contigo</p>}
    </Link>
  );
}

export default async function DepartamentoDetailPage({
  params,
}: {
  params: Promise<{ departamentoId: string }>;
}) {
  const { departamentoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const departamento = await getDepartamento(departamentoId);
  if (!departamento) redirect("/planificacion/departamentos");

  const proyectos = await listProyectosDeDepartamento(departamentoId);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <Link
          href="/planificacion/departamentos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Departamentos
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{departamento.name}</h1>
          <p className="text-sm text-muted-foreground">Proyectos de este departamento.</p>
        </div>

        {proyectos.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {proyectos.map((p) => (
              <ProyectoCard key={p.id} proyecto={p} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            Todavía no hay proyectos en este departamento. Crea uno nuevo en modo &ldquo;Avanzado&rdquo; y asígnalo aquí.
          </p>
        )}
      </div>
    </div>
  );
}
