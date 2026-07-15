import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./Sidebar";
import { logout } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar
        email={user?.email}
        canView={Boolean(flags?.can_view)}
        canManagePlatform={Boolean(flags?.can_manage_platform)}
        onLogout={logout}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
