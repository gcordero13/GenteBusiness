import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm } from "./InviteUserForm";
import { InviteFromContactDialog } from "./InviteFromContactDialog";
import { UsersTable } from "./UsersTable";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "users",
  });
  const flags = flagsRows?.[0];

  if (!flags?.can_manage) {
    redirect("/");
  }

  const { data: users } = await supabase
    .from("app_users")
    .select("id, email, full_name, role_profile_id, status, role_profiles(name)")
    .order("email");
  const { data: profiles } = await supabase.from("role_profiles").select("id, name").order("name");

  const admin = createAdminClient();
  const { data: contactsWithEmail } = await admin
    .from("contacts")
    .select("id, first_name, last_name, email")
    .not("email", "is", null)
    .eq("status", "active")
    .order("first_name");
  const existingEmails = new Set((users ?? []).map((u) => u.email.toLowerCase()));
  const availableContacts = (contactsWithEmail ?? [])
    .filter((c) => c.email && !existingEmails.has(c.email.toLowerCase()))
    .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, email: c.email! }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Administra el acceso, el perfil y la contraseña de cada usuario de la plataforma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InviteFromContactDialog contacts={availableContacts} />
          <InviteUserForm profiles={profiles ?? []} />
        </div>
      </div>
      <UsersTable users={users ?? []} profiles={profiles ?? []} />
    </div>
  );
}
