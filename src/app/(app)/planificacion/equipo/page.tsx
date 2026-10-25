import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSupervisedContacts } from "./actions";
import { AssignPoaDialog } from "./AssignPoaDialog";

export default async function MiEquipoPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  const flags = flagsRows?.[0];
  if (!flags?.can_manage && !flags?.can_authorize) {
    redirect("/");
  }

  const currentYear = new Date().getFullYear();
  const contacts = await listSupervisedContacts(currentYear);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi equipo — POAs {currentYear}</h1>
          <p className="text-sm text-muted-foreground">
            Gente de tu(s) departamento(s) y el estado de su POA de este año.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          {contacts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No tienes departamentos asignados para supervisar todavía.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Nombre</th>
                  <th className="pb-2 pr-3 font-medium">Departamento</th>
                  <th className="pb-2 pr-3 font-medium">Puesto</th>
                  <th className="pb-2 pr-3 font-medium">Estado</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.contactId} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{c.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.departmentName ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.positionName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.hasPoaForYear ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {c.hasPoaForYear ? "Asignado" : "Sin POA"}
                      </span>
                    </td>
                    <td className="py-2">
                      <AssignPoaDialog contact={c} periodYear={currentYear} />
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
