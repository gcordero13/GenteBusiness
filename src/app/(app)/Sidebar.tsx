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
  FileText,
  Fingerprint,
  GraduationCap,
  HardHat,
  Inbox,
  Repeat,
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
  Target,
  Truck,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// Navy menu with the current page highlighted in the brand teal (approved
// redesign 2026-11-27). Same in light and dark themes.
const LINK_BASE =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#04B1AF] focus-visible:outline-none";
const LINK_IDLE = "text-[#C9D6E0] hover:bg-white/10 hover:text-white";
const LINK_ACTIVE = "bg-[#04B1AF]/20 font-semibold text-[#7FE3E1]";

/** The link whose href is the longest prefix of the current path (so "/a/b" wins over "/a"). */
function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
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
  current,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  links: NavLink[];
  collapsed: boolean;
  onNavigate?: () => void;
  /** The active link's href, to highlight the group and the sub-link. */
  current: string | null;
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
  const groupActive = links.some((l) => l.href === current);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        title={label}
        className={cn("w-full", LINK_BASE, groupActive ? LINK_ACTIVE : LINK_IDLE, open && !groupActive && "bg-white/10 text-white")}
      >
        <Icon className="size-[18px] shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>
            <ChevronRight className="size-4 shrink-0 opacity-70" />
          </>
        )}
      </button>
      {open && (
        // Its own text color: otherwise it inherits the navy menu's light gray
        // and the options look washed out on the white panel (user report).
        <div className="absolute top-0 left-full z-50 ml-2 min-w-[230px] space-y-0.5 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg">
          {links.map(({ href, label: subLabel, icon: SubIcon }) => (
            <a
              key={href}
              href={href}
              title={subLabel}
              aria-current={href === current ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap hover:bg-muted",
                href === current && "bg-[#04B1AF]/12 font-semibold text-[#036E6C] dark:text-[#5FD6D4]",
              )}
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
  canUseGoservices,
  canManageSuministros,
  canViewSuministros,
  canViewServiciosGenerales,
  canManageServiciosGenerales,
  canViewAprendizaje,
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
  canUseGoservices: boolean;
  canManageSuministros: boolean;
  canViewSuministros: boolean;
  canViewServiciosGenerales: boolean;
  canManageServiciosGenerales: boolean;
  canViewAprendizaje: boolean;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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
    ...(canUseGoservices ? [{ href: "/solicitudes/goservices", label: "GoServices", icon: ClipboardList }] : []),
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
    ...(canManageServiciosGenerales
      ? [
          { href: "/servicios-generales/activos", label: "Activos", icon: Package },
          { href: "/servicios-generales/proveedores", label: "Proveedores", icon: Truck },
          { href: "/servicios-generales/planes", label: "Planes de mantenimiento", icon: Repeat },
        ]
      : []),
  ];

  const mainLinksAfterMaintenance: NavLink[] = [
    { href: "/planificacion", label: "Proyectos", icon: Target },
    ...(canViewAprendizaje ? [{ href: "/aprendizaje", label: "Aprendizaje", icon: GraduationCap }] : []),
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
      ? [{ href: "/solicitudes/vacaciones", label: "Permisos", icon: FileText }]
      : []),
  ];

  const current = activeHref(pathname ?? "", [
    ...mainLinksBeforeMaintenance,
    ...mantenimientosLinks,
    ...mainLinksAfterMaintenance,
    ...suministrosSubLinks,
    ...solicitudesLinks,
    ...settingsLinks,
  ].map((l) => l.href));

  function renderLink({ href, label, icon: Icon }: NavLink) {
    const active = href === current;
    return (
      <a
        key={href}
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(LINK_BASE, active ? LINK_ACTIVE : LINK_IDLE)}
      >
        <Icon className="size-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </a>
    );
  }

  const sectionLabel = (text: string) =>
    !collapsed && <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-[#6F879A] uppercase">{text}</p>;

  return (
    <aside
      // No overflow-* here: any overflow value clips the side flyouts
      // (Mantenimientos, Suministros, Ajustes), which open outside the menu
      // (user report 2026-11-27: "no se muestra si le doy un clic").
      className={`flex h-full shrink-0 flex-col justify-between bg-[#0B2545] p-3 text-[#C9D6E0] transition-all duration-150 dark:bg-[#071a31] ${
        collapsed ? "w-16" : "w-64 md:w-60"
      }`}
    >
      <div className="space-y-5">
        <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : "justify-between"}`}>
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1" title="Gente Sánchez Business">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#04B1AF] text-xs font-bold text-white">
              GSB
            </span>
            {!collapsed && (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-white">Gente Sánchez</span>
                <span className="block text-xs text-[#8FA6B8]">Business</span>
              </span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="text-[#C9D6E0] hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
        <nav className="space-y-0.5" aria-label="Menú principal">
          {sectionLabel("Módulos")}
          {mainLinksBeforeMaintenance.map(renderLink)}
          <FlyoutNavGroup
            label="Mantenimientos"
            icon={Wrench}
            links={mantenimientosLinks}
            collapsed={collapsed}
            onNavigate={onNavigate}
            current={current}
          />
          {mainLinksAfterMaintenance.map(renderLink)}
          {(suministrosSubLinks.length > 0 || solicitudesLinks.length > 0) && (
            <div className="space-y-0.5 pt-4">
              {!collapsed && (
                <p className="flex items-center gap-2 px-2.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-[#6F879A] uppercase">
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
                current={current}
              />
              {solicitudesLinks.map(renderLink)}
            </div>
          )}
          {settingsLinks.length > 0 && (
            <div className="space-y-0.5 pt-4">
              {sectionLabel("Ajustes")}
              <FlyoutNavGroup
                label="Ajustes"
                icon={Settings}
                links={settingsLinks}
                collapsed={collapsed}
                onNavigate={onNavigate}
                current={current}
              />
            </div>
          )}
        </nav>
      </div>
      <div className="hidden space-y-2 pt-4 md:block">
        {!collapsed && <p className="truncate px-2.5 text-xs text-[#8FA6B8]">{email}</p>}
        <form action={onLogout}>
          <Button
            type="submit"
            variant="outline"
            className={`border-white/15 bg-transparent text-[#C9D6E0] hover:bg-white/10 hover:text-white dark:border-white/15 dark:bg-transparent ${
              collapsed ? "w-full px-0" : "w-full justify-start gap-2"
            }`}
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
