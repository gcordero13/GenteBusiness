import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let pathname = "/planificacion/proyectos/p1";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { Sidebar } = await import("./Sidebar");

const PERMISOS = {
  canViewContacts: true,
  canViewPonchador: false,
  canManageUsers: false,
  canManageRoleProfiles: false,
  canManageCompanies: false,
  canManageDepartments: false,
  canManageActivities: false,
  canManageSettings: false,
  canUseDocumentStamps: false,
  canViewMaintenance: false,
  canViewSolicitudesVacaciones: false,
  canManageAttendanceDevices: false,
  canManageSchedules: false,
  canViewComplaints: false,
  canViewGoservices: false,
  canManageGoservicesAsignadas: false,
  canUseGoservices: true,
  canManageSuministros: false,
  canViewSuministros: false,
  canViewServiciosGenerales: false,
  canManageServiciosGenerales: false,
  canViewAprendizaje: true,
};

describe("Sidebar", () => {
  it("highlights the module of the current page, including its sub-pages", () => {
    render(<Sidebar email="ana@example.com" {...PERMISOS} onLogout={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Proyectos" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Aprende" }).getAttribute("aria-current")).toBeNull();
  });

  // Regression (2026-11-27): an overflow-y-auto on the menu clipped the side
  // flyouts, so clicking "Mantenimientos", "Suministros" or "Ajustes" showed nothing.
  it("opens a group's sub-menu on click, without clipping it", () => {
    render(<Sidebar email="ana@example.com" {...PERMISOS} canManageCompanies onLogout={vi.fn()} />);
    const menu = screen.getByRole("navigation", { name: "Menú principal" }).closest("aside")!;
    // On a computer nothing may clip the side flyout.
    expect(menu.className).toContain("md:overflow-visible");

    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    const empresas = screen.getByRole("link", { name: "Empresas" });
    expect(empresas.getAttribute("href")).toBe("/companies");
    // Readable on its white panel: not the navy menu's inherited light gray.
    expect(empresas.parentElement!.className).toContain("text-popover-foreground");
  });

  // User report (2026-11-27): on a phone the side flyout didn't fit next to
  // the drawer. There the options open below the group, inside the menu.
  it("opens sub-menus below the group on a phone, to the side on a computer", () => {
    render(<Sidebar email="ana@example.com" {...PERMISOS} canManageCompanies onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    const submenu = screen.getByTestId("submenu");
    const clases = submenu.className.split(" ");
    expect(clases).not.toContain("absolute");
    expect(clases).toContain("md:absolute");
    expect(clases).toContain("md:left-full");
  });

  it("picks the most specific link when several match", () => {
    pathname = "/solicitudes/goservices/123";
    render(<Sidebar email="ana@example.com" {...PERMISOS} onLogout={vi.fn()} />);
    expect(screen.getByRole("link", { name: "GoServices" }).getAttribute("aria-current")).toBe("page");
  });
});
