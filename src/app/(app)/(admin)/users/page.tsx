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
    .select("id, first_name, last_name, email, status, photo_url")
    .not("email", "is", null)
    .order("first_name");
  const existingEmails = new Set((users ?? []).map((u) => u.email.toLowerCase()));
  const availableContacts = (contactsWithEmail ?? [])
    .filter((c) => c.status === "active" && c.email && !existingEmails.has(c.email.toLowerCase()))
    .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, email: c.email! }));

  // Each user's name and photo come from their Agenda contact, matched by
  // email (most accounts have no full_name) - user request, 2026-11-27.
  const contactByEmail = new Map<string, { name: string; photoUrl: string | null }>();
  for (const c of contactsWithEmail ?? []) {
    const key = c.email!.trim().toLowerCase();
    const current = contactByEmail.get(key);
    if (!current || c.status === "active") {
      contactByEmail.set(key, { name: `${c.first_name} ${c.last_name}`.trim(), photoUrl: c.photo_url });
    }
  }
  const rows = (users ?? []).map((u) => {
    const contact = contactByEmail.get(u.email.trim().toLowerCase());
    return {
      ...u,
      display_name: contact?.name || u.full_name?.trim() || null,
      photo_url: contact?.photoUrl ?? null,
    };
  });

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">
            Ajustes <span aria-hidden="true">/</span> <span className="font-medium text-foreground">Usuarios</span>
          </p>
          <h1 className="text-[28px] font-bold tracking-tight text-[#0B2545] dark:text-foreground">Usuarios</h1>
          <p className="text-[15px] text-muted-foreground">
            Quién entra a la plataforma, con qué perfil, y su contraseña.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InviteFromContactDialog contacts={availableContacts} />
          <InviteUserForm profiles={profiles ?? []} />
        </div>
      </div>
      <UsersTable users={rows} profiles={profiles ?? []} />
    </div>
  );
}
