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
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "role_profiles",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const { data: modules } = await supabase.from("modules").select("id, key, label").order("label");
  const { data: profiles } = await supabase
    .from("role_profiles")
    .select("id, name, role_profile_permissions(module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)")
    .order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Perfiles de rol</h1>
        <RoleProfileForm modules={modules ?? []} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(profiles ?? []).map((profile) => (
            <TableRow key={profile.id}>
              <TableCell className="font-medium">{profile.name}</TableCell>
              <TableCell>
                <RoleProfileForm
                  modules={modules ?? []}
                  initial={{
                    id: profile.id,
                    name: profile.name,
                    permissions: (profile.role_profile_permissions ?? []) as never,
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
