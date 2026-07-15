import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./Sidebar";
import { logout } from "./actions";

interface ModulePermissionRow {
  module_key: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_deactivate: boolean;
  can_manage: boolean;
  can_authorize: boolean;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = new Map<string, ModulePermissionRow>(
    (permissionRows ?? []).map((p: ModulePermissionRow) => [p.module_key, p]),
  );

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar
        email={user?.email}
        canViewContacts={Boolean(permissions.get("contacts")?.can_view)}
        canManageUsers={Boolean(permissions.get("users")?.can_manage)}
        canManageRoleProfiles={Boolean(permissions.get("role_profiles")?.can_manage)}
        canManageCompanies={Boolean(permissions.get("companies")?.can_manage)}
        canManageDepartments={Boolean(permissions.get("departments")?.can_manage)}
        canManageActivities={Boolean(permissions.get("activities")?.can_manage)}
        onLogout={logout}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
