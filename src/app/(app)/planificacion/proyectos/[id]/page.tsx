import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DeleteIconButton } from "@/components/DeleteIconButton";
import {
  deleteProyecto,
  getProyecto,
  listAssignableUsers,
  listEstados,
  listPlanificaciones,
  listTareasDeProyecto,
  updateTareaEstado,
} from "../actions";
import { ProyectosWorkspace } from "../ProyectosWorkspace";
import { TareaCreateDialog } from "../TareaCreateDialog";
import { CompartirDialog } from "../CompartirDialog";
import { EstadosEditor } from "../EstadosEditor";
import { PlanificacionesManager } from "../PlanificacionesManager";
import { ProyectoEncabezado } from "../ProyectoEncabezado";
import { hoyISO, resumenTareas } from "../visual";

export default async function ProyectoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const proyecto = await getProyecto(id);
  if (!proyecto) redirect("/planificacion");

  const [tasks, estados, assignees, planificaciones] = await Promise.all([
    listTareasDeProyecto(id),
    listEstados(id),
    listAssignableUsers(),
    listPlanificaciones(id),
  ]);

  const columns = estados.map((e) => ({ key: e.id, label: e.name, color: e.color }));

  // Overall project progress: the average of ROOT-level tasks' percent, not
  // every row - a root task's own percent already folds in its whole
  // subtree via the rollup trigger (see resumenTareas).
  const resumen = resumenTareas(tasks, hoyISO());

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <ProyectoEncabezado
        migas={[{ label: "Proyectos", href: "/planificacion" }]}
        colorKey={proyecto.id}
        title={proyecto.name}
        description={proyecto.description}
        meta={
          proyecto.departamentoName && (
            <Link
              href={`/planificacion/departamentos/${proyecto.departamentoId}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#036E6C] dark:hover:text-[#5FD6D4]"
            >
              <Building2 className="size-4" />
              {proyecto.departamentoName}
            </Link>
          )
        }
        resumen={resumen}
        actions={
          <>
            <EstadosEditor proyectoId={id} estados={estados} />
            <PlanificacionesManager proyectoId={id} planificaciones={planificaciones} />
            <CompartirDialog proyectoId={id} parentProyectoId={id} />
            <TareaCreateDialog
              proyectoId={id}
              parentTaskId={null}
              estados={estados}
              assignees={assignees}
              planificaciones={planificaciones}
              triggerLabel="Nueva tarea"
            />
            {proyecto.createdBy === user.id && (
              <DeleteIconButton
                confirmMessage={`¿Eliminar el proyecto "${proyecto.name}"? Se eliminarán también todas sus tareas. Esta acción no se puede deshacer.`}
                action={deleteProyecto.bind(null, id)}
              />
            )}
          </>
        }
      />

      <ProyectosWorkspace
        tasks={tasks}
        columns={columns}
        columnKeyBy="estadoId"
        onDropEstado={updateTareaEstado.bind(null, id)}
        defaultProyectoId={id}
        estados={estados}
        assignees={assignees}
        planificaciones={planificaciones}
      />
    </div>
  );
}
