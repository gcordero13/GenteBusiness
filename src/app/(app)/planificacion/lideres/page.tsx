import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listDepartmentLeaders, listAssignableAppUsers } from "./actions";
import { LeaderFormDialog, RemoveLeaderButton } from "./LeaderFormDialog";

export default async function PlanificacionLideresPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  if (!flagsRows?.[0]?.can_authorize) {
    redirect("/");
  }

  const [leaders, users, { data: departments }] = await Promise.all([
    listDepartmentLeaders(),
    listAssignableAppUsers(),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Líderes por departamento</h1>
            <p className="text-sm text-muted-foreground">
              Quién puede supervisar los POAs de cada departamento.
            </p>
          </div>
          <LeaderFormDialog users={users} departments={departments ?? []} />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          {leaders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Todavía no has asignado ningún líder de departamento.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Persona</th>
                  <th className="pb-2 pr-3 font-medium">Departamento</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {leaders.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{l.userName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{l.departmentName}</td>
                    <td className="py-2 text-right">
                      <RemoveLeaderButton id={l.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
