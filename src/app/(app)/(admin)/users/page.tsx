import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users as UsersIcon } from "lucide-react";
import { InviteUserForm } from "./InviteUserForm";
import { SetPasswordDialog } from "./SetPasswordDialog";
import { RoleProfileSelect } from "./RoleProfileSelect";

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
    .select("id, email, full_name, role_profile_id, role_profiles(name)")
    .order("email");
  const { data: profiles } = await supabase.from("role_profiles").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <InviteUserForm profiles={profiles ?? []} />
      </div>
      {(users ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <UsersIcon className="size-8" />
          <p className="text-sm">No hay usuarios todavía.</p>
          <p className="text-xs">Invita al primero con el botón &quot;Invitar usuario&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Correo</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(users ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <RoleProfileSelect
                    userId={u.id}
                    currentProfileId={u.role_profile_id}
                    profiles={profiles ?? []}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <SetPasswordDialog userId={u.id} email={u.email} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
