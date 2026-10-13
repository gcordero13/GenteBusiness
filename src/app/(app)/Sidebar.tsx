"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  BookUser,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock,
  FileSignature,
  Fingerprint,
  HardHat,
  Inbox,
  LayoutGrid,
  LogOut,
  MessageSquareWarning,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Palmtree,
  PartyPopper,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// A group whose sub-links open in a flyout to the side instead of pushing
// the rest of the menu down — confirmed with the user ("el menú debe
// desplegarse hacia los lados no hacia abajo"). Closes on an outside click
// or as soon as a sub-link is picked.
function FlyoutNavGroup({
  label,
  icon: Icon,
  links,
  collapsed,
  onNavigate,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  links: NavLink[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (links.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        title={label}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted",
          open && "bg-muted",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute top-0 left-full z-50 ml-1 min-w-[220px] space-y-0.5 rounded-lg border bg-card p-1.5 shadow-lg">
          {links.map(({ href, label: subLabel, icon: SubIcon }) => (
            <a
              key={href}
              href={href}
              title={subLabel}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap hover:bg-muted"
            >
              <SubIcon className="size-4 shrink-0" />
              <span>{subLabel}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  email,
  canViewContacts,
  canViewPonchador,
  canManageUsers,
  canManageRoleProfiles,
  canManageCompanies,
  canManageDepartments,
  canManageActivities,
  canManageSettings,
  canUseDocumentStamps,
  canViewMaintenance,
  canViewSolicitudesVacaciones,
  canManageAttendanceDevices,
  canManageSchedules,
  canViewComplaints,
  canViewGoservices,
  canManageGoservicesAsignadas,
  canManageSuministros,
  canViewSuministros,
  canViewServiciosGenerales,
  onLogout,
  onNavigate,
}: {
  email?: string;
  canViewContacts: boolean;
  canViewPonchador: boolean;
  canManageUsers: boolean;
  canManageRoleProfiles: boolean;
  canManageCompanies: boolean;
  canManageDepartments: boolean;
  canManageActivities: boolean;
  canManageSettings: boolean;
  canUseDocumentStamps: boolean;
  canViewMaintenance: boolean;
  canViewSolicitudesVacaciones: boolean;
  canManageAttendanceDevices: boolean;
  canManageSchedules: boolean;
  canViewComplaints: boolean;
  canViewGoservices: boolean;
  canManageGoservicesAsignadas: boolean;
  canManageSuministros: boolean;
  canViewSuministros: boolean;
  canViewServiciosGenerales: boolean;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // One-time sync from localStorage on mount; deferred to an effect (rather
    // than a lazy useState initializer) so server and client render the same
    // initial markup and avoid a hydration mismatch.
    if (localStorage.getItem("sidebar-collapsed") === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const mainLinksBeforeMaintenance: NavLink[] = [
    { href: "/my-profile", label: "Mi perfil", icon: UserCircle },
    { href: "/quejas/nueva", label: "Canal para Reportar", icon: MessageSquareWarning },
    ...(canViewComplaints ? [{ href: "/quejas", label: "Reportes Recibidos", icon: Inbox }] : []),
    { href: "/solicitudes/goservices", label: "GoServices", icon: ClipboardList },
    ...(canManageGoservicesAsignadas
      ? [{ href: "/solicitudes/goservices/asignadas", label: "GoServices: Asignadas", icon: ClipboardList }]
      : []),
    ...(canViewGoservices ? [{ href: "/goservices", label: "GoServices: Gestión", icon: ClipboardList }] : []),
    ...(canViewPonchador ? [{ href: "/ponchador", label: "Ponchador", icon: CalendarClock }] : []),
    ...(canViewContacts ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
    ...(canUseDocumentStamps ? [{ href: "/document-stamps", label: "Sellos y Firmas", icon: FileSignature }] : []),
  ];

  // "Mantenimiento de TI" is the pre-existing equipment-checklist module
  // (gated by canViewMaintenance); "Servicios Generales" is gated the same
  // way every other module is - only visible once granted in Perfiles de
  // rol (can_view or can_manage), never open to everyone by default.
  const mantenimientosLinks: NavLink[] = [
    ...(canViewMaintenance ? [{ href: "/maintenance", label: "Mantenimiento de TI", icon: Wrench }] : []),
    ...(canViewServiciosGenerales
      ? [{ href: "/servicios-generales", label: "Servicios Generales", icon: HardHat }]
      : []),
  ];

  const mainLinksAfterMaintenance: NavLink[] = [
    ...(canManageUsers ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];

  const settingsLinks: NavLink[] = [
    ...(canManageRoleProfiles ? [{ href: "/role-profiles", label: "Perfiles de rol", icon: ShieldCheck }] : []),
    ...(canManageCompanies ? [{ href: "/companies", label: "Empresas", icon: Building2 }] : []),
    ...(canManageDepartments ? [{ href: "/departments", label: "Departamentos", icon: Network }] : []),
    ...(canManageActivities ? [{ href: "/activities", label: "Actividades", icon: PartyPopper }] : []),
    ...(canManageAttendanceDevices
      ? [{ href: "/attendance-devices", label: "Ponchadores", icon: Fingerprint }]
      : []),
    ...(canManageSchedules ? [{ href: "/schedules", label: "Horarios", icon: Clock }] : []),
    ...(canManageSettings ? [{ href: "/settings", label: "Correo (SMTP)", icon: Settings }] : []),
  ];

  // The whole Suministros group - including "Solicitud de suministros" -
  // only shows once can_view or can_manage is granted in Perfiles de rol
  // (reversed from an earlier "open to everyone" design, per the user).
  // Despacho/Tablero/Crear artículos additionally require can_manage.
  const suministrosSubLinks: NavLink[] = [
    ...(canViewSuministros ? [{ href: "/suministros", label: "Solicitud de suministros", icon: ShoppingCart }] : []),
    ...(canManageSuministros
      ? [
          { href: "/suministros/despacho", label: "Despacho de suministros", icon: Truck },
          { href: "/suministros/tablero", label: "Tablero de solicitudes", icon: LayoutGrid },
          { href: "/suministros/articulos", label: "Crear artículos", icon: Package },
        ]
      : []),
  ];

  const solicitudesLinks: NavLink[] = [
    ...(canViewSolicitudesVacaciones
      ? [{ href: "/solicitudes/vacaciones", label: "Vacaciones", icon: Palmtree }]
      : []),
  ];

  return (
    <aside
      className={`flex h-full shrink-0 flex-col justify-between border-r bg-card p-3 transition-all duration-150 ${
        collapsed ? "w-16" : "w-64 md:w-56"
      }`}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <a href="/" className="text-lg font-semibold">
              Gente Sánchez Business
            </a>
          )}
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
          {mainLinksBeforeMaintenance.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              title={label}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </a>
          ))}
          <FlyoutNavGroup
            label="Mantenimientos"
            icon={Wrench}
            links={mantenimientosLinks}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          {mainLinksAfterMaintenance.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              title={label}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </a>
          ))}
          {(suministrosSubLinks.length > 0 || solicitudesLinks.length > 0) && (
            <div className="space-y-1 pt-4">
              {!collapsed && (
                <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <Palmtree className="size-3.5" />
                  Solicitudes
                </p>
              )}
              <FlyoutNavGroup
                label="Suministros"
                icon={Package}
                links={suministrosSubLinks}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
              {solicitudesLinks.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  title={label}
                  onClick={onNavigate}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </a>
              ))}
            </div>
          )}
          {settingsLinks.length > 0 && (
            <div className="space-y-1 pt-4">
              {!collapsed && (
                <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <Settings className="size-3.5" />
                  Ajustes
                </p>
              )}
              <FlyoutNavGroup
                label="Ajustes"
                icon={Settings}
                links={settingsLinks}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </div>
          )}
        </nav>
      </div>
      <div className="hidden space-y-2 md:block">
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
