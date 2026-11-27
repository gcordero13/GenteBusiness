import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UsersTableRow } from "./UsersTable";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ setUserStatus: vi.fn(), deleteUsers: vi.fn() }));
vi.mock("./EditUserDialog", () => ({ EditUserDialog: () => null }));
vi.mock("./SetPasswordDialog", () => ({ SetPasswordDialog: () => null }));
vi.mock("./RoleProfileSelect", () => ({ RoleProfileSelect: () => null }));
vi.mock("./DeleteUserDialog", () => ({ DeleteUserDialog: () => null }));

const { UsersTable, coincideUsuario } = await import("./UsersTable");

const USERS: UsersTableRow[] = [
  { id: "u1", email: "maria.fernandez@empresa.com", full_name: null, role_profile_id: "p1", status: "active", display_name: "María Fernández" },
  { id: "u2", email: "rsosa@empresa.com", full_name: "Ramón Sosa", role_profile_id: "p1", status: "active", display_name: "Ramón Sosa" },
  { id: "u3", email: "soporte@empresa.com", full_name: null, role_profile_id: "p1", status: "active", display_name: null },
];

describe("UsersTable", () => {
  it("shows each user's name above their email", () => {
    render(<UsersTable users={USERS} profiles={[]} />);
    expect(screen.getByText("María Fernández")).toBeTruthy();
    expect(screen.getByText("maria.fernandez@empresa.com")).toBeTruthy();
    expect(screen.getByText("Sin nombre en la Agenda")).toBeTruthy();
  });

  it("finds users by name, without minding accents or case", () => {
    render(<UsersTable users={USERS} profiles={[]} />);
    fireEvent.change(screen.getByLabelText("Buscar por nombre o correo"), { target: { value: "maria fern" } });
    expect(screen.getByText("María Fernández")).toBeTruthy();
    expect(screen.queryByText("Ramón Sosa")).toBeNull();
    expect(screen.getByText("1 de 3")).toBeTruthy();
  });

  it("finds users by email", () => {
    render(<UsersTable users={USERS} profiles={[]} />);
    fireEvent.change(screen.getByLabelText("Buscar por nombre o correo"), { target: { value: "rsosa@" } });
    expect(screen.getByText("Ramón Sosa")).toBeTruthy();
    expect(screen.queryByText("María Fernández")).toBeNull();
  });

  it("says so when nobody matches", () => {
    render(<UsersTable users={USERS} profiles={[]} />);
    fireEvent.change(screen.getByLabelText("Buscar por nombre o correo"), { target: { value: "zzz" } });
    expect(screen.getByText("Ningún usuario coincide con «zzz».")).toBeTruthy();
  });

  it("selects only the users shown by the search", () => {
    render(<UsersTable users={USERS} profiles={[]} />);
    fireEvent.change(screen.getByLabelText("Buscar por nombre o correo"), { target: { value: "ramon" } });
    fireEvent.click(screen.getByLabelText("Seleccionar todos"));
    expect(screen.getByText("1 usuario(s) seleccionado(s)")).toBeTruthy();
  });
});

describe("coincideUsuario", () => {
  it("needs every word to appear in the name or the email", () => {
    expect(coincideUsuario(USERS[0], "fernandez empresa")).toBe(true);
    expect(coincideUsuario(USERS[0], "fernandez sosa")).toBe(false);
  });
});
