import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleProfileForm } from "./RoleProfileForm";
import { DeleteRoleProfileDialog } from "./DeleteRoleProfileDialog";
import {
  ComplaintViewersPanel,
  type ComplaintViewerAppUserOption,
  type ComplaintViewerRow,
} from "./ComplaintViewersPanel";

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

  // Someone can have can_manage on role_profiles without also having it on
  // users, and the viewer picker below still needs the full company roster
  // in that case - so this deliberately reads app_users via the admin client
  // (bypassing RLS) rather than the caller's own narrower RLS-visible slice,
  // same precedent as the contacts fetch in users/page.tsx.
  const admin = createAdminClient();
  const { data: allAppUsers } = await admin
    .from("app_users")
    .select("id, email, full_name")
    .order("email");

  const { data: complaintViewersRows } = await supabase
    .from("complaint_viewers")
    .select("id, app_user_id, app_users(email, full_name)")
    .order("created_at");

  const complaintViewerUsers: ComplaintViewerAppUserOption[] = (allAppUsers ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name,
  }));

  const complaintViewers: ComplaintViewerRow[] = (complaintViewersRows ?? []).map((v) => {
    const relatedUser = v.app_users as unknown as { email: string; full_name: string | null } | null;
    return {
      id: v.id,
      appUserId: v.app_user_id,
      label: relatedUser?.full_name ?? relatedUser?.email ?? v.app_user_id,
    };
  });

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
                <div className="flex flex-wrap justify-end gap-2">
                  <RoleProfileForm
                    modules={modules ?? []}
                    initial={{
                      id: profile.id,
                      name: profile.name,
                      permissions: (profile.role_profile_permissions ?? []) as never,
                    }}
                  />
                  {profile.name !== "Super Admin" && (
                    <DeleteRoleProfileDialog profileId={profile.id} name={profile.name} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ComplaintViewersPanel users={complaintViewerUsers} viewers={complaintViewers} />
    </div>
  );
}
