"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  BookUser,
  Building2,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "true") {
      setCollapsed(true);
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  const mainLinks: NavLink[] = [
    ...(canView ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
    ...(canManagePlatform ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];

  const settingsLinks: NavLink[] = canManagePlatform
    ? [
        { href: "/role-profiles", label: "Perfiles de rol", icon: ShieldCheck },
        { href: "/companies", label: "Empresas", icon: Building2 },
        { href: "/departments", label: "Departamentos", icon: Network },
      ]
    : [];

  return (
    <aside
      className={`flex shrink-0 flex-col justify-between border-r bg-card p-3 transition-all duration-150 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {!collapsed && <span className="text-lg font-semibold">GenteBusiness</span>}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        </div>
        <nav className="space-y-1 text-sm">
          {mainLinks.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              title={label}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </a>
          ))}
          {settingsLinks.length > 0 && (
            <div className="space-y-1 pt-4">
              {!collapsed && (
                <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <Settings className="size-3.5" />
                  Ajustes
                </p>
              )}
              {settingsLinks.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  title={label}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </a>
              ))}
            </div>
          )}
        </nav>
      </div>
      <div className="space-y-2">
        {!collapsed && <p className="truncate px-2 text-xs text-muted-foreground">{email}</p>}
        <form action={onLogout}>
          <Button
            type="submit"
            variant="outline"
            className={collapsed ? "w-full px-0" : "w-full justify-start gap-2"}
            title="Cerrar sesión"
          >
            <LogOut className="size-4" />
            {!collapsed && <span>Cerrar sesión</span>}
          </Button>
        </form>
      </div>
    </aside>
  );
}
