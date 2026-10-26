import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProyecto,
  listAssignableUsers,
  listCiclos,
  listEstados,
  listModulos,
  listTareasDeProyecto,
  updateTareaEstado,
} from "../actions";
import { ProyectosWorkspace } from "../ProyectosWorkspace";
import { TareaCreateDialog } from "../TareaCreateDialog";
import { CompartirDialog } from "../CompartirDialog";
import { EstadosEditor } from "../EstadosEditor";
import { CiclosManager } from "../CiclosManager";
import { ModulosManager } from "../ModulosManager";

export default async function ProyectoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const proyecto = await getProyecto(id);
  if (!proyecto) redirect("/planificacion");

  const [tasks, estados, ciclos, modulos, assignees] = await Promise.all([
    listTareasDeProyecto(id),
    listEstados(id),
    listCiclos(id),
    listModulos(id),
    listAssignableUsers(),
  ]);

  const columns = estados.map((e) => ({ key: e.id, label: e.name, color: e.color }));

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
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

        <div className="grid gap-4 md:grid-cols-3">
          <EstadosEditor proyectoId={id} estados={estados} />
          <CiclosManager proyectoId={id} ciclos={ciclos} />
          <ModulosManager proyectoId={id} modulos={modulos} />
        </div>

        <ProyectosWorkspace
          tasks={tasks}
          columns={columns}
          getColumnKey={(t) => t.estadoId ?? "sin-estado"}
          onDropEstado={updateTareaEstado.bind(null, id)}
          defaultProyectoId={id}
        />
      </div>
    </div>
  );
}
