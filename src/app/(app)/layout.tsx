import { createClient } from "@/lib/supabase/server";
import { AppShell } from "./AppShell";
import { logout } from "./actions";
import { PushNotificationManager } from "./PushNotificationManager";

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
  const { data: canViewComplaints } = await supabase.rpc("can_view_complaints");

  return (
    <AppShell
      email={user?.email}
      canViewContacts={Boolean(permissions.get("contacts")?.can_view)}
      canViewPonchador={Boolean(permissions.get("ponchador")?.can_view)}
      canManageUsers={Boolean(permissions.get("users")?.can_manage)}
      canManageRoleProfiles={Boolean(permissions.get("role_profiles")?.can_manage)}
      canManageCompanies={Boolean(permissions.get("companies")?.can_manage)}
      canManageDepartments={Boolean(permissions.get("departments")?.can_manage)}
      canManageActivities={Boolean(permissions.get("activities")?.can_manage)}
      canManageSettings={Boolean(permissions.get("settings")?.can_manage)}
      canUseDocumentStamps={Boolean(permissions.get("document_stamps")?.can_add)}
      canViewMaintenance={Boolean(permissions.get("maintenance")?.can_view)}
      canViewSolicitudesVacaciones={Boolean(permissions.get("solicitudes_vacaciones")?.can_view)}
      canManageAttendanceDevices={Boolean(permissions.get("attendance_devices")?.can_manage)}
      canManageSchedules={Boolean(permissions.get("schedules")?.can_manage)}
      canViewComplaints={Boolean(canViewComplaints)}
      canViewGoservices={Boolean(permissions.get("goservices")?.can_authorize)}
      canManageGoservicesAsignadas={Boolean(permissions.get("goservices")?.can_manage)}
      canManageSuministros={Boolean(permissions.get("suministros")?.can_manage)}
      canViewSuministros={Boolean(
        permissions.get("suministros")?.can_view || permissions.get("suministros")?.can_manage,
      )}
      canViewServiciosGenerales={Boolean(
        permissions.get("servicios_generales")?.can_view || permissions.get("servicios_generales")?.can_manage,
      )}
      onLogout={logout}
    >
      <PushNotificationManager />
      {children}
    </AppShell>
  );
}
