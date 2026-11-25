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
