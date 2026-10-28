import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getPlanificacion,
  getProyecto,
  listAssignableUsers,
  listEstados,
  listTareasDeProyecto,
  updateTareaEstado,
} from "../../actions";
import { ProyectosWorkspace } from "../../ProyectosWorkspace";
import { TareaCreateDialog } from "../../TareaCreateDialog";
import { progressOpacity } from "../../progress";
import { tasksUnderPlanificacion } from "../../taskTree";

export default async function PlanificacionDetailPage({
  params,
}: {
  params: Promise<{ id: string; planificacionId: string }>;
}) {
  const { id, planificacionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const proyecto = await getProyecto(id);
  if (!proyecto) redirect("/planificacion");

  const planificacion = await getPlanificacion(planificacionId);
  if (!planificacion) redirect(`/planificacion/proyectos/${id}`);

  const [allTasks, estados, assignees] = await Promise.all([
    listTareasDeProyecto(id),
    listEstados(id),
    listAssignableUsers(),
  ]);

  const tasks = tasksUnderPlanificacion(allTasks, planificacionId);
  const columns = estados.map((e) => ({ key: e.id, label: e.name, color: e.color }));

  const rootTasks = tasks.filter((t) => !t.parentTaskId);
  const planificacionPercent =
    rootTasks.length > 0 ? Math.round(rootTasks.reduce((sum, t) => sum + t.percentComplete, 0) / rootTasks.length) : 0;

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <Link
          href={`/planificacion/proyectos/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver a {proyecto.name}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[14rem] space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{planificacion.name}</h1>
            {planificacion.description && <p className="text-sm text-muted-foreground">{planificacion.description}</p>}
            {rootTasks.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-[#04B1AF]"
                    style={{ width: `${planificacionPercent}%`, opacity: progressOpacity(planificacionPercent) }}
                  />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">{planificacionPercent}% completado</span>
              </div>
            )}
          </div>
          <TareaCreateDialog
            proyectoId={id}
            parentTaskId={null}
            estados={estados}
            assignees={assignees}
            fixedPlanificacionId={planificacionId}
            triggerLabel="Nueva tarea"
          />
        </div>

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
