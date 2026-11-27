import { redirect } from "next/navigation";
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
import { ProyectoEncabezado } from "../../ProyectoEncabezado";
import { tasksUnderPlanificacion } from "../../taskTree";
import { hoyISO, resumenTareas } from "../../visual";

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

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <ProyectoEncabezado
        migas={[
          { label: "Proyectos", href: "/planificacion" },
          { label: proyecto.name, href: `/planificacion/proyectos/${id}` },
        ]}
        colorKey={proyecto.id}
        title={planificacion.name}
        description={planificacion.description}
        resumen={resumenTareas(tasks, hoyISO())}
        actions={
          <TareaCreateDialog
            proyectoId={id}
            parentTaskId={null}
            estados={estados}
            assignees={assignees}
            fixedPlanificacionId={planificacionId}
            triggerLabel="Nueva tarea"
          />
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
      />
    </div>
  );
}
