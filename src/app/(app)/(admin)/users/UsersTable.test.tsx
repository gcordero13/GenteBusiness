import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsersTableRow } from "./UsersTable";

const setUserStatus = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ setUserStatus: (...a: unknown[]) => setUserStatus(...a), deleteUsers: vi.fn() }));
vi.mock("./EditUserDialog", () => ({ EditUserDialog: ({ open }: { open?: boolean }) => (open ? <p>Diálogo: nombre</p> : null) }));
vi.mock("./SetPasswordDialog", () => ({
  SetPasswordDialog: ({ open, email }: { open?: boolean; email: string }) => (open ? <p>Diálogo: contraseña de {email}</p> : null),
}));
vi.mock("./RoleProfileSelect", () => ({ RoleProfileSelect: () => null }));
vi.mock("./DeleteUserDialog", () => ({ DeleteUserDialog: ({ open }: { open?: boolean }) => (open ? <p>Diálogo: eliminar</p> : null) }));

const { UsersTable, coincideUsuario } = await import("./UsersTable");

const USERS: UsersTableRow[] = [
  { id: "u1", email: "maria.fernandez@empresa.com", full_name: null, role_profile_id: "p1", status: "active", display_name: "María Fernández" },
  { id: "u2", email: "rsosa@empresa.com", full_name: "Ramón Sosa", role_profile_id: "p2", status: "active", display_name: "Ramón Sosa" },
  { id: "u3", email: "soporte@empresa.com", full_name: null, role_profile_id: "p1", status: "deactivated", display_name: null },
];
const PROFILES = [
  { id: "p1", name: "Viewer" },
  { id: "p2", name: "Super Admin" },
];

// The table (computer) and the cards (phone) both render in tests.
const tabla = () => within(screen.getByRole("table"));
const buscar = (value: string) => fireEvent.change(screen.getByLabelText("Buscar por nombre o correo"), { target: { value } });

describe("UsersTable", () => {
  beforeEach(() => setUserStatus.mockReset().mockResolvedValue({}));

  it("sums up users at the top", () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    // The number cards come first ("Activos" is also a filter tab further down).
    const numero = (label: string) => screen.getAllByText(label)[0].nextElementSibling?.textContent;
    expect(numero("Usuarios")).toBe("3");
    expect(numero("Activos")).toBe("2");
    expect(numero("Anulados")).toBe("1");
    expect(numero("Sin nombre en la Agenda")).toBe("1");
  });

  it("shows each user's name above their email, and their estado", () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    expect(tabla().getByText("María Fernández")).toBeTruthy();
    expect(tabla().getByText("maria.fernandez@empresa.com")).toBeTruthy();
    expect(tabla().getByText("Sin nombre en la Agenda")).toBeTruthy();
    expect(tabla().getByText("Anulado")).toBeTruthy();
  });

  it("finds users by name (accents and case don't matter) or by email", () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    buscar("maria fern");
    expect(tabla().getByText("María Fernández")).toBeTruthy();
    expect(tabla().queryByText("Ramón Sosa")).toBeNull();
    expect(screen.getByText("1 de 3")).toBeTruthy();
    buscar("rsosa@");
    expect(tabla().getByText("Ramón Sosa")).toBeTruthy();
  });

  it("filters by estado and by perfil", () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    fireEvent.click(screen.getByRole("tab", { name: /Anulados/ }));
    expect(tabla().getByText("soporte@empresa.com")).toBeTruthy();
    expect(tabla().queryByText("María Fernández")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Todos/ }));
    fireEvent.change(screen.getByLabelText("Perfil"), { target: { value: "p2" } });
    expect(tabla().getByText("Ramón Sosa")).toBeTruthy();
    expect(tabla().queryByText("María Fernández")).toBeNull();
  });

  it("says so when nobody matches", () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    buscar("zzz");
    expect(screen.getByText("Ningún usuario coincide con «zzz».")).toBeTruthy();
  });

  it("selects only the users shown", () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    buscar("ramon");
    fireEvent.click(screen.getByLabelText("Seleccionar todos"));
    expect(screen.getByText("1 usuario(s) seleccionado(s)")).toBeTruthy();
  });

  it("groups each user's actions in one menu", async () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    fireEvent.click(tabla().getByRole("button", { name: "Acciones de Ramón Sosa" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Cambiar contraseña/ }));
    expect(await screen.findByText("Diálogo: contraseña de rsosa@empresa.com")).toBeTruthy();
  });

  it("revokes access from the menu", async () => {
    render(<UsersTable users={USERS} profiles={PROFILES} />);
    fireEvent.click(tabla().getByRole("button", { name: "Acciones de María Fernández" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Anular acceso/ }));
    await waitFor(() => expect(setUserStatus).toHaveBeenCalledWith({ userId: "u1", status: "deactivated" }));
  });
});

describe("coincideUsuario", () => {
  it("needs every word to appear in the name or the email", () => {
    expect(coincideUsuario(USERS[0], "fernandez empresa")).toBe(true);
    expect(coincideUsuario(USERS[0], "fernandez sosa")).toBe(false);
  });
});
