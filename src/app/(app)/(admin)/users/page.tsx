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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users as UsersIcon } from "lucide-react";
import { InviteUserForm } from "./InviteUserForm";
import { SetPasswordDialog } from "./SetPasswordDialog";
import { RoleProfileSelect } from "./RoleProfileSelect";
import { EditUserDialog } from "./EditUserDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { setUserStatus } from "./actions";

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
    .select("id, email, full_name, role_profile_id, status, role_profiles(name)")
    .order("email");
  const { data: profiles } = await supabase.from("role_profiles").select("id, name").order("name");

  return (
    <div className="space-y-6 p-6">
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
                <TableHead className="py-3">Estado</TableHead>
                <TableHead className="py-3 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => {
                async function toggleStatus() {
                  "use server";
                  await setUserStatus({
                    userId: u.id,
                    status: u.status === "active" ? "deactivated" : "active",
                  });
                }

                return (
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
                    <TableCell className="py-3">
                      <Badge variant={u.status === "active" ? "default" : "secondary"}>
                        {u.status === "active" ? "Activo" : "Anulado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <EditUserDialog userId={u.id} fullName={u.full_name} />
                        <SetPasswordDialog userId={u.id} email={u.email} />
                        <form action={toggleStatus}>
                          <Button type="submit" variant="outline" size="sm">
                            {u.status === "active" ? "Anular" : "Reactivar"}
                          </Button>
                        </form>
                        <DeleteUserDialog userId={u.id} email={u.email} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
