import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";

const actions = {
  updateCurso: vi.fn(),
  setCursoStatus: vi.fn(),
  deleteCurso: vi.fn(),
  setCursoCover: vi.fn(),
  createLeccion: vi.fn(),
  reorderLecciones: vi.fn(),
  updateLeccion: vi.fn(),
  setLeccionVideoFile: vi.fn(),
  deleteLeccion: vi.fn(),
  addLeccionArchivo: vi.fn(),
  removeLeccionArchivo: vi.fn(),
  startUpload: vi.fn(),
  updateEvalSettings: vi.fn(),
  savePregunta: vi.fn(),
  setPreguntaActiva: vi.fn(),
  deletePregunta: vi.fn(),
  setAnunciarProximamente: vi.fn(),
  setLeccionQuiz: vi.fn(),
};
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
vi.mock("../actions", () => actions);

const { CursoEditor } = await import("./CursoEditor");

function leccion(id: string, title: string) {
  return { id, position: 0, title, body: null, videoUrl: null, videoFile: null, archivos: [], completed: false, quiz: null };
}

const CURSO: CursoDetail = {
  id: "c1",
  title: "Historia de la empresa",
  description: "Nuestros orígenes",
  category: "historia",
  status: "borrador",
  cover: null,
  completedAt: null,
  evaluacion: { passingScore: 70, maxAttempts: null },
  anunciarProximamente: false,
  lecciones: [leccion("l1", "Fundación"), leccion("l2", "Crecimiento")],
};

describe("CursoEditor", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset().mockResolvedValue({}));
    push.mockReset();
  });

  it("saves the course details", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Historia de Sánchez" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));

    await waitFor(() =>
      expect(actions.updateCurso).toHaveBeenCalledWith("c1", {
        title: "Historia de Sánchez",
        description: "Nuestros orígenes",
        category: "historia",
      }),
    );
  });

  it("publishes a draft and shows a server error", async () => {
    actions.setCursoStatus.mockResolvedValue({ error: "Agrega al menos una lección antes de publicar." });
    render(<CursoEditor curso={CURSO} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(actions.setCursoStatus).toHaveBeenCalledWith("c1", "publicado"));
    expect(await screen.findByText("Agrega al menos una lección antes de publicar.")).toBeTruthy();
  });

  it("offers archiving for a published course", () => {
    render(<CursoEditor curso={{ ...CURSO, status: "publicado" }} />);
    expect(screen.getByRole("button", { name: "Archivar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eliminar curso" })).toBeNull();
  });

  it("adds a lesson", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.change(screen.getByPlaceholderText("Título de la nueva lección"), { target: { value: "Hoy" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar lección/ }));

    await waitFor(() => expect(actions.createLeccion).toHaveBeenCalledWith("c1", "Hoy"));
  });

  it("moves a lesson down", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Bajar lección" })[0]);

    await waitFor(() => expect(actions.reorderLecciones).toHaveBeenCalledWith("c1", ["l2", "l1"]));
  });

  it("announces a draft as Próximamente", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.click(screen.getByLabelText(/Anunciar como “Próximamente”/));
    await waitFor(() => expect(actions.setAnunciarProximamente).toHaveBeenCalledWith("c1", true));
  });

  it("only offers the announcement for drafts", () => {
    render(<CursoEditor curso={{ ...CURSO, status: "publicado" }} />);
    expect(screen.queryByLabelText(/Anunciar como “Próximamente”/)).toBeNull();
  });
});
