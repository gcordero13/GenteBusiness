import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TareaListRow } from "./actions";

const getTarea = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./CompartirDialog", () => ({ CompartirDialog: () => null }));
vi.mock("./actions", () => ({
  addAdjunto: vi.fn(),
  addComentario: vi.fn(),
  createTarea: vi.fn(),
  deleteTarea: vi.fn(),
  getTarea: (id: string) => getTarea(id),
  listAdjuntos: vi.fn().mockResolvedValue([]),
  listComentarios: vi.fn().mockResolvedValue([]),
  listEstados: vi.fn().mockResolvedValue([]),
  listSubtareas: vi.fn().mockResolvedValue([]),
  removeAdjunto: vi.fn(),
  updateTarea: vi.fn(),
  updateTareaPercent: vi.fn(),
}));

const { TareaDetailModal } = await import("./TareaDetailModal");

function tarea(overrides: Partial<TareaListRow>): TareaListRow {
  return {
    id: "t1",
    proyectoId: "p1",
    proyectoName: "Proyecto",
    parentTaskId: null,
    title: "Tarea",
    description: null,
    estadoId: null,
    estadoName: null,
    estadoColor: null,
    estadoKind: null,
    priority: null,
    labels: [],
    startDate: null,
    dueDate: null,
    assigneeId: null,
    assigneeName: null,
    assigneePhotoUrl: null,
    cicloId: null,
    planificacionId: null,
    planificacionName: null,
    createdBy: "u1",
    creatorName: "Usuario",
    creatorPhotoUrl: null,
    moduloIds: [],
    relationship: "mio",
    percentComplete: 0,
    color: null,
    hasChildren: false,
    ...overrides,
  };
}

const PARENT = tarea({ id: "parent", title: "Tarea principal" });
const SUB = tarea({ id: "sub", title: "Subtarea", parentTaskId: "parent" });

describe("TareaDetailModal - side panel", () => {
  it("shows the task as a side panel with its estado, priority and readable dates", () => {
    render(
      <TareaDetailModal
        tarea={tarea({
          title: "Conciliación bancaria",
          proyectoName: "Cierre fiscal",
          planificacionName: "Conciliaciones",
          estadoName: "En proceso",
          estadoColor: "#3b82f6",
          estadoKind: "en_proceso",
          priority: "alta",
          startDate: "2026-11-10",
          dueDate: "2026-12-05",
        })}
        onClose={vi.fn()}
      />,
    );
    const panel = screen.getByRole("dialog", { name: "Conciliación bancaria" });
    expect(panel.textContent).toContain("Cierre fiscal › Conciliaciones");
    expect(screen.getByText("En proceso")).toBeTruthy();
    expect(screen.getByText("Alta")).toBeTruthy();
    expect(screen.getByText("10 nov 2026 → 5 dic 2026")).toBeTruthy();
  });

  it("closes with Esc", () => {
    const onClose = vi.fn();
    render(<TareaDetailModal tarea={PARENT} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("TareaDetailModal - back to the parent task", () => {
  beforeEach(() => getTarea.mockReset());

  it("doesn't show the back button on a root task", () => {
    render(<TareaDetailModal tarea={PARENT} onClose={vi.fn()} onSelectTarea={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Volver a la tarea principal/ })).toBeNull();
  });

  it("opens the parent task when going back from a sub-task", async () => {
    getTarea.mockResolvedValue(PARENT);
    const onSelectTarea = vi.fn();
    const onClose = vi.fn();
    render(<TareaDetailModal tarea={SUB} onClose={onClose} onSelectTarea={onSelectTarea} />);

    fireEvent.click(screen.getByRole("button", { name: /Volver a la tarea principal/ }));

    await waitFor(() => expect(onSelectTarea).toHaveBeenCalledWith(PARENT));
    expect(getTarea).toHaveBeenCalledWith("parent");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes back to the project when the parent task isn't visible to the viewer", async () => {
    getTarea.mockResolvedValue(null);
    const onSelectTarea = vi.fn();
    const onClose = vi.fn();
    render(<TareaDetailModal tarea={SUB} onClose={onClose} onSelectTarea={onSelectTarea} />);

    fireEvent.click(screen.getByRole("button", { name: /Volver a la tarea principal/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSelectTarea).not.toHaveBeenCalled();
  });
});
