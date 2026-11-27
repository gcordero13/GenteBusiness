import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TareaListRow } from "./actions";
import { ListaView } from "./ListaView";

vi.mock("./visual", async (orig) => ({ ...(await orig<typeof import("./visual")>()), hoyISO: () => "2026-11-27" }));

function tarea(over: Partial<TareaListRow> & Pick<TareaListRow, "id" | "title">): TareaListRow {
  return {
    proyectoId: "p1",
    proyectoName: "Cierre fiscal",
    parentTaskId: null,
    description: null,
    estadoId: "e1",
    estadoName: "En proceso",
    estadoColor: "#3b82f6",
    estadoKind: "en_proceso",
    priority: "alta",
    labels: [],
    startDate: null,
    dueDate: "2026-11-24",
    assigneeId: "u2",
    assigneeName: "María Fernández",
    assigneePhotoUrl: null,
    cicloId: null,
    planificacionId: "pl1",
    planificacionName: "Conciliaciones",
    createdBy: "u1",
    creatorName: "Ramón Sosa",
    creatorPhotoUrl: null,
    moduloIds: [],
    relationship: "mio",
    percentComplete: 60,
    color: null,
    hasChildren: false,
    ...over,
  } as TareaListRow;
}

const PADRE = tarea({ id: "t1", title: "Conciliación bancaria", hasChildren: true });
const HIJA_1 = tarea({ id: "s1", title: "Banco Popular", parentTaskId: "t1", percentComplete: 100 });
const HIJA_2 = tarea({ id: "s2", title: "Banreservas", parentTaskId: "t1", percentComplete: 0 });
const CONTEO = tarea({
  id: "t2",
  title: "Conteo de almacén",
  planificacionId: "pl2",
  planificacionName: "Inventario",
  priority: "baja",
  dueDate: "2026-12-05",
  percentComplete: 0,
});

const tabla = () => within(screen.getByRole("table"));

describe("ListaView", () => {
  it("shows estado, priority, readable dates and sub-task progress", () => {
    render(
      <ListaView tasks={[PADRE, CONTEO]} allTasks={[PADRE, HIJA_1, HIJA_2, CONTEO]} onSelect={vi.fn()} onToggleComplete={vi.fn()} />,
    );
    expect(tabla().getAllByText("En proceso").length).toBe(2);
    expect(tabla().getByText("Alta")).toBeTruthy();
    expect(tabla().getByText("Baja")).toBeTruthy();
    expect(tabla().getByText("Venció el 24 nov")).toBeTruthy();
    expect(tabla().getByText("5 dic 2026")).toBeTruthy();
    expect(tabla().getByText("1/2 subtareas")).toBeTruthy();
    // Several projects: each row says which one.
    expect(tabla().getAllByRole("link", { name: "Cierre fiscal" }).length).toBe(2);
  });

  it("groups a single project's tasks by planificación", () => {
    render(
      <ListaView
        tasks={[PADRE, CONTEO]}
        allTasks={[PADRE, CONTEO]}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
        showProyecto={false}
        groupByPlanificacion
      />,
    );
    expect(tabla().getByText("Conciliaciones")).toBeTruthy();
    expect(tabla().getByText("Inventario")).toBeTruthy();
    expect(tabla().queryByRole("columnheader", { name: "Proyecto" })).toBeNull();
  });

  it("expands sub-tasks, opens a task and marks it done", () => {
    const onSelect = vi.fn();
    const onToggleComplete = vi.fn();
    render(
      <ListaView tasks={[PADRE, CONTEO]} allTasks={[PADRE, HIJA_1, HIJA_2, CONTEO]} onSelect={onSelect} onToggleComplete={onToggleComplete} />,
    );

    fireEvent.click(tabla().getByRole("button", { name: "Ver subtareas" }));
    expect(tabla().getByText("Banreservas")).toBeTruthy();

    fireEvent.click(tabla().getByText("Conteo de almacén"));
    expect(onSelect).toHaveBeenCalledWith(CONTEO);

    fireEvent.click(tabla().getByRole("button", { name: 'Marcar "Conteo de almacén" como completada' }));
    expect(onToggleComplete).toHaveBeenCalledWith("t2", "p1", expect.any(HTMLElement));
  });

  it("also renders phone cards", () => {
    render(<ListaView tasks={[CONTEO]} allTasks={[CONTEO]} onSelect={vi.fn()} onToggleComplete={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /Conteo de almacén/ }).length).toBeGreaterThan(0);
  });

  it("explains an empty list", () => {
    render(<ListaView tasks={[]} allTasks={[]} onSelect={vi.fn()} onToggleComplete={vi.fn()} />);
    expect(screen.getByText("Sin tareas todavía")).toBeTruthy();
  });
});
