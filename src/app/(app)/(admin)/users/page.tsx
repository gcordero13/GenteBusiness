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
    .select("id, email, full_name, role_profile_id, status, goservices_ejecutor_type, role_profiles(name)")
    .order("email");
  const { data: profiles } = await supabase.from("role_profiles").select("id, name").order("name");

  // The GoServices "tipo de ejecutor" control only makes sense for a role
  // profile that's actually ejecutor-eligible there (can_manage) — shown
  // per-user by checking their current role profile against this set.
  const admin = createAdminClient();
  const { data: goservicesModule } = await admin.from("modules").select("id").eq("key", "goservices").single();
  const { data: goservicesEjecutorPerms } = goservicesModule
    ? await admin
        .from("role_profile_permissions")
        .select("role_profile_id")
        .eq("module_id", goservicesModule.id)
        .eq("can_manage", true)
    : { data: [] };
  const goservicesEjecutorProfileIds = new Set(
    (goservicesEjecutorPerms ?? []).map((p: { role_profile_id: string }) => p.role_profile_id),
  );

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
      <UsersTable
        users={(users ?? []).map((u) => ({
          ...u,
          canManageGoservices: goservicesEjecutorProfileIds.has(u.role_profile_id),
        }))}
        profiles={profiles ?? []}
      />
    </div>
  );
}
