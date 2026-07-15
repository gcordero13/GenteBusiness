import { Button } from "@/components/ui/button";

export function Sidebar({
  email,
  canView,
  canManagePlatform,
  onLogout,
}: {
  email?: string;
  canView: boolean;
  canManagePlatform: boolean;
  onLogout: () => Promise<void>;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col justify-between border-r p-4">
      <div className="space-y-6">
        <div className="text-lg font-semibold">GenteBusiness</div>
        <nav className="space-y-4 text-sm">
          {canView && (
            <a href="/contacts" className="block underline">
              Agenda de contactos
            </a>
          )}
          {canManagePlatform && (
            <a href="/users" className="block underline">
              Usuarios
            </a>
          )}
          {canManagePlatform && (
            <div className="space-y-1">
              <p className="font-medium text-muted-foreground">Ajustes</p>
              <a href="/role-profiles" className="block pl-2 underline">
                Perfiles de rol
              </a>
              <a href="/companies" className="block pl-2 underline">
                Empresas
              </a>
              <a href="/departments" className="block pl-2 underline">
                Departamentos
              </a>
            </div>
          )}
        </nav>
      </div>
      <div className="space-y-2">
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        <form action={onLogout}>
          <Button type="submit" variant="outline" className="w-full">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </aside>
  );
}
