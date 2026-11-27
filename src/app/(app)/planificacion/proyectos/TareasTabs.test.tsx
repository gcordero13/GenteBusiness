import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProyectoListRow, TareaListRow } from "./actions";

// The workspace itself is tested on its own; here only which tasks reach it.
vi.mock("./ProyectosWorkspace", () => ({
  ProyectosWorkspace: ({ tasks, toolbarStart }: { tasks: TareaListRow[]; toolbarStart?: React.ReactNode }) => (
    <div>
      <div data-testid="fila-vistas">
        {toolbarStart}
        <span>Lista</span>
      </div>
      <ul aria-label="Tareas">
        {tasks.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </div>
  ),
}));

const { TareasTabs } = await import("./TareasTabs");

const tarea = (id: string, title: string) => ({ id, title, parentTaskId: null }) as TareaListRow;

const proyecto = (id: string, name: string) =>
  ({ id, name, description: null, departamentoName: null, departamentoId: null, isOwner: true }) as unknown as ProyectoListRow;

function renderTabs() {
  render(
    <TareasTabs
      misProyectos={[proyecto("p1", "Portal de clientes")]}
      proyectosCompartidos={[proyecto("p2", "Cierre fiscal")]}
      resumenByProyecto={{}}
      misTareasCreadas={[tarea("c1", "Tarea que creé")]}
      misTareasCreadasColumns={[]}
      misTareas={[tarea("a1", "Tarea asignada a mí"), tarea("a2", "Otra asignada")]}
      misColumns={[]}
      compartidoConmigo={[]}
      compartidoColumns={[]}
      tareasSinResponsableActivo={[]}
      tareasSinResponsableActivoColumns={[]}
      estados={[]}
      assignees={[]}
    />,
  );
}

describe("TareasTabs", () => {
  it("no longer lists the tasks I created under Mis proyectos", () => {
    renderTabs();
    expect(screen.queryByText("Tareas que he creado")).toBeNull();
    expect(screen.queryByText("Tarea que creé")).toBeNull();
  });

  it("shows Mis tareas in two tabs: assigned to me and created by me", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: /Mis tareas/ }));

    expect(screen.getByRole("tab", { name: /Asignadas a mí/ }).getAttribute("aria-selected")).toBe("true");
    // Same row as the view switcher, not a row of its own.
    expect(within(screen.getByTestId("fila-vistas")).getByRole("tab", { name: /Creadas por mí/ })).toBeTruthy();
    expect(screen.getByText("Tarea asignada a mí")).toBeTruthy();
    expect(screen.queryByText("Tarea que creé")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Creadas por mí/ }));
    expect(screen.getByText("Tarea que creé")).toBeTruthy();
    expect(screen.queryByText("Tarea asignada a mí")).toBeNull();
  });

  it("shows only the projects I created under Mis proyectos; shared ones under Compartido conmigo", () => {
    renderTabs();
    expect(screen.getByText("Portal de clientes")).toBeTruthy();
    expect(screen.queryByText("Cierre fiscal")).toBeNull();
    expect(screen.getByRole("tab", { name: /Mis proyectos/ }).textContent).toContain("1");

    fireEvent.click(screen.getByRole("tab", { name: /Compartido conmigo/ }));
    expect(screen.getByText("Proyectos compartidos")).toBeTruthy();
    expect(screen.getByText("Cierre fiscal")).toBeTruthy();
    expect(screen.queryByText("Portal de clientes")).toBeNull();
  });

  it("counts both kinds in the Mis tareas tab", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: /Mis tareas/ }).textContent).toContain("3");
  });
});
