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
import { RoleProfileForm } from "./RoleProfileForm";

export default async function RoleProfilesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: profiles } = await supabase.from("role_profiles").select("*").order("name");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Perfiles de rol</h1>
        <RoleProfileForm />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Ver</TableHead>
            <TableHead>Agregar</TableHead>
            <TableHead>Editar</TableHead>
            <TableHead>Eliminar</TableHead>
            <TableHead>Anular</TableHead>
            <TableHead>Gestiona</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(profiles ?? []).map((profile) => (
            <TableRow key={profile.id}>
              <TableCell className="font-medium">{profile.name}</TableCell>
              <TableCell>{profile.can_view ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_add ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_edit ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_delete ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_deactivate ? "✓" : "—"}</TableCell>
              <TableCell>{profile.can_manage_platform ? "✓" : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
