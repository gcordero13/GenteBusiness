import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listDepartments } from "../proyectos/actions";

export default async function DepartamentosIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const departamentos = await listDepartments();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <Link
          href="/planificacion"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Proyecto
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Departamentos</h1>
          <p className="text-sm text-muted-foreground">Proyectos organizados por departamento.</p>
        </div>

        {departamentos.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {departamentos.map((d) => (
              <Link
                key={d.id}
                href={`/planificacion/departamentos/${d.id}`}
                className="flex items-center gap-2 rounded-xl border p-3 text-sm transition-colors hover:border-[#04B1AF] hover:bg-[#04B1AF]/5"
              >
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-semibold text-foreground">{d.name}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            Todavía no hay departamentos registrados.
          </p>
        )}
      </div>
    </div>
  );
}
