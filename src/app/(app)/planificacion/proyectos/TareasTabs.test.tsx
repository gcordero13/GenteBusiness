import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TareaListRow } from "./actions";

// The workspace itself is tested on its own; here only which tasks reach it.
vi.mock("./ProyectosWorkspace", () => ({
  ProyectosWorkspace: ({ tasks }: { tasks: TareaListRow[] }) => (
    <ul aria-label="Tareas">
      {tasks.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  ),
}));

const { TareasTabs } = await import("./TareasTabs");

const tarea = (id: string, title: string) => ({ id, title, parentTaskId: null }) as TareaListRow;

function renderTabs() {
  render(
    <TareasTabs
      misProyectos={[]}
      proyectosCompartidos={[]}
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
    expect(screen.getByText("Tarea asignada a mí")).toBeTruthy();
    expect(screen.queryByText("Tarea que creé")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Creadas por mí/ }));
    expect(screen.getByText("Tarea que creé")).toBeTruthy();
    expect(screen.queryByText("Tarea asignada a mí")).toBeNull();
  });

  it("counts both kinds in the Mis tareas tab", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: /Mis tareas/ }).textContent).toContain("3");
  });
});
