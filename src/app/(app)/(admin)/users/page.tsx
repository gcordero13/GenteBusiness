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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users as UsersIcon } from "lucide-react";
import { InviteUserForm } from "./InviteUserForm";
import { SetPasswordDialog } from "./SetPasswordDialog";
import { RoleProfileSelect } from "./RoleProfileSelect";

function initialsFor(fullName: string | null, email: string): string {
  const trimmedName = fullName?.trim();
  if (trimmedName) {
    const [first, second] = trimmedName.split(/\s+/);
    return `${first?.[0] ?? ""}${second?.[0] ?? ""}`.toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Administra el acceso, el perfil y la contraseña de cada usuario de la plataforma.
          </p>
        </div>
        <InviteUserForm profiles={profiles ?? []} />
      </div>
      {(users ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <UsersIcon className="size-8" />
          <p className="text-sm">No hay usuarios todavía.</p>
          <p className="text-xs">Invita al primero con el botón &quot;Invitar usuario&quot;.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="py-3">Usuario</TableHead>
                <TableHead className="py-3">Perfil</TableHead>
                <TableHead className="py-3 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback>{initialsFor(u.full_name, u.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        {u.full_name && <p className="truncate font-medium">{u.full_name}</p>}
                        <p
                          className={`truncate ${u.full_name ? "text-xs text-muted-foreground" : "font-medium"}`}
                        >
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <RoleProfileSelect
                      userId={u.id}
                      currentProfileId={u.role_profile_id}
                      profiles={profiles ?? []}
                    />
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <SetPasswordDialog userId={u.id} email={u.email} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
