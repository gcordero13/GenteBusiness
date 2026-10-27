import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProyecto, listAssignableUsers, listEstados, listTareasDeProyecto, updateTareaEstado } from "../actions";
import { ProyectosWorkspace } from "../ProyectosWorkspace";
import { TareaCreateDialog } from "../TareaCreateDialog";
import { CompartirDialog } from "../CompartirDialog";
import { EstadosEditor } from "../EstadosEditor";

export default async function ProyectoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const proyecto = await getProyecto(id);
  if (!proyecto) redirect("/planificacion");

  const [tasks, estados, assignees] = await Promise.all([
    listTareasDeProyecto(id),
    listEstados(id),
    listAssignableUsers(),
  ]);

  const columns = estados.map((e) => ({ key: e.id, label: e.name, color: e.color }));

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <Link
          href="/planificacion"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Planificación
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{proyecto.name}</h1>
            {proyecto.description && <p className="text-sm text-muted-foreground">{proyecto.description}</p>}
          </div>
          <div className="flex gap-2">
            <CompartirDialog proyectoId={id} parentProyectoId={id} />
            <TareaCreateDialog
              proyectoId={id}
              parentTaskId={null}
              estados={estados}
              assignees={assignees}
              triggerLabel="Nueva tarea"
            />
          </div>
        </div>

        <EstadosEditor proyectoId={id} estados={estados} />

        <ProyectosWorkspace
          tasks={tasks}
          columns={columns}
          columnKeyBy="estadoId"
          onDropEstado={updateTareaEstado.bind(null, id)}
          defaultProyectoId={id}
          estados={estados}
          assignees={assignees}
        />
      </div>
    </div>
  );
}
