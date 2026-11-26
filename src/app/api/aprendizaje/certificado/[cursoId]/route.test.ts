import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const generateCertificadoPdf = vi.fn();
const getSharePointDownloadUrl = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser }, rpc }) }));
vi.mock("@/lib/siteUrl", () => ({ getSiteUrl: async () => "https://gente.example.com" }));
vi.mock("@/lib/sharepoint", () => ({ getSharePointDownloadUrl: (...a: unknown[]) => getSharePointDownloadUrl(...a) }));
vi.mock("@/lib/aprendizaje/certificadoPdf", () => ({
  generateCertificadoPdf: (...a: unknown[]) => generateCertificadoPdf(...a),
}));

const { GET } = await import("./route");

const ROW = {
  codigo: "AB12-CD34-EF56",
  nombre: "Ana Pérez",
  curso_title: "Ciberseguridad",
  completed_at: "2026-11-26T15:00:00Z",
  firma_nombre: "Laura Martínez",
  firma_cargo: "Gerente de Gestión Humana",
  firma_drive_id: null,
  firma_item_id: null,
};

const call = () => GET(new Request("https://gente.example.com/api/aprendizaje/certificado/c1"), { params: Promise.resolve({ cursoId: "c1" }) });

describe("GET /api/aprendizaje/certificado/[cursoId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    generateCertificadoPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  });

  it("requires a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
  });

  it("refuses when the course isn't completed (no certificate row)", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await call();
    expect(res.status).toBe(404);
    expect(rpc).toHaveBeenCalledWith("aprendizaje_mi_certificado", { p_curso_id: "c1" });
    expect(generateCertificadoPdf).not.toHaveBeenCalled();
  });

  it("returns the owner's PDF with a QR to the public check", async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment;");
    expect(res.headers.get("Content-Disposition")).toContain("Certificado%20-%20Ciberseguridad.pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(generateCertificadoPdf).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: "AB12-CD34-EF56", curso: "Ciberseguridad", firmaNombre: "Laura Martínez" }),
      { qrUrl: "https://gente.example.com/certificados/AB12-CD34-EF56", firmaBytes: null },
    );
    expect(getSharePointDownloadUrl).not.toHaveBeenCalled();
  });

  it("still issues the certificate when the signature image can't be fetched", async () => {
    rpc.mockResolvedValue({ data: [{ ...ROW, firma_drive_id: "d1", firma_item_id: "i1" }], error: null });
    getSharePointDownloadUrl.mockRejectedValue(new Error("Graph caído"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(generateCertificadoPdf).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ firmaBytes: null }));
  });
});
