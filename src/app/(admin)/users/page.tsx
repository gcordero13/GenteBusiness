import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteUserForm } from "./InviteUserForm";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];

  if (!flags?.can_manage_platform) {
    redirect("/");
  }

  const { data: users } = await supabase
    .from("app_users")
    .select("id, email, full_name, role_profiles(name)")
    .order("email");
  const { data: profiles } = await supabase.from("role_profiles").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Usuarios</h1>
      <InviteUserForm profiles={profiles ?? []} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>Correo</th>
            <th>Perfil</th>
          </tr>
        </thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{(u.role_profiles as unknown as { name: string })?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
