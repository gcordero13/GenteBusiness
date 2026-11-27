import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateProyecto = vi.fn();
const listDepartments = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({
  updateProyecto: (...a: unknown[]) => updateProyecto(...a),
  listDepartments: () => listDepartments(),
}));

const { EditarProyectoDialog } = await import("./EditarProyectoDialog");

const PROYECTO = {
  id: "p1",
  name: "Cierre fiscal",
  description: "Conciliaciones",
  departamentoId: "d1",
  departamentoName: "Finanzas",
};

const abrir = () => fireEvent.click(screen.getByRole("button", { name: /Editar/ }));

describe("EditarProyectoDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProyecto.mockResolvedValue({});
    listDepartments.mockResolvedValue([
      { id: "d1", name: "Finanzas" },
      { id: "d2", name: "Tecnología" },
    ]);
  });

  it("lets the owner rename it and move it to another department", async () => {
    render(<EditarProyectoDialog proyecto={PROYECTO} isOwner />);
    abrir();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cierre fiscal 2026" } });
    await screen.findByRole("option", { name: "Tecnología" });
    fireEvent.change(screen.getByLabelText("Departamento"), { target: { value: "d2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateProyecto).toHaveBeenCalledWith("p1", {
        name: "Cierre fiscal 2026",
        description: "Conciliaciones",
        departamentoId: "d2",
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("doesn't touch the department when the owner leaves it as is", async () => {
    render(<EditarProyectoDialog proyecto={PROYECTO} isOwner />);
    abrir();
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Nueva descripción" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(updateProyecto).toHaveBeenCalledWith("p1", { name: "Cierre fiscal", description: "Nueva descripción" }),
    );
  });

  it("can take the department off", async () => {
    render(<EditarProyectoDialog proyecto={PROYECTO} isOwner />);
    abrir();
    fireEvent.change(screen.getByLabelText("Departamento"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateProyecto).toHaveBeenCalledWith("p1", expect.objectContaining({ departamentoId: null })));
  });

  it("shows no department field to people it was shared with", () => {
    render(<EditarProyectoDialog proyecto={PROYECTO} isOwner={false} />);
    abrir();
    expect(screen.queryByLabelText("Departamento")).toBeNull();
    expect(listDepartments).not.toHaveBeenCalled();
  });

  it("shows the server's error and stays open", async () => {
    updateProyecto.mockResolvedValue({ error: "No tienes permiso para editar este proyecto." });
    render(<EditarProyectoDialog proyecto={PROYECTO} isOwner={false} />);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("No tienes permiso para editar este proyecto.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("can't be saved without a name", () => {
    render(<EditarProyectoDialog proyecto={PROYECTO} isOwner />);
    abrir();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "  " } });
    expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
