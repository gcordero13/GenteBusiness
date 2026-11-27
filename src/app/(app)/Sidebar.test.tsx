import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("link", { name: "Aprendizaje" }).getAttribute("aria-current")).toBeNull();
  });

  it("picks the most specific link when several match", () => {
    pathname = "/solicitudes/goservices/123";
    render(<Sidebar email="ana@example.com" {...PERMISOS} onLogout={vi.fn()} />);
    expect(screen.getByRole("link", { name: "GoServices" }).getAttribute("aria-current")).toBe("page");
  });
});
