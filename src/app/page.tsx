import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const canManagePlatform = flagsRows?.[0]?.can_manage_platform;
  const canView = flagsRows?.[0]?.can_view;

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Bienvenido</h1>
      <p className="text-sm text-muted-foreground">{user?.email}</p>
      {canView && (
        <a href="/contacts" className="block text-sm underline">
          Agenda de contactos
        </a>
      )}
      {canManagePlatform && (
        <nav className="space-y-1 rounded border p-3 text-sm">
          <a href="/users" className="block underline">
            Usuarios
          </a>
          <a href="/role-profiles" className="block underline">
            Perfiles de rol
          </a>
          <a href="/companies" className="block underline">
            Empresas
          </a>
          <a href="/departments" className="block underline">
            Departamentos
          </a>
        </nav>
      )}
      <form action={logout}>
        <Button type="submit" variant="outline" className="w-full">
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
