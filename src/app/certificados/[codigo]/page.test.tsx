import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const { default: Page } = await import("./page");

const open = async (codigo: string) => render(await Page({ params: Promise.resolve({ codigo }) }));

describe("certificate verification page", () => {
  beforeEach(() => rpc.mockReset());

  it("confirms a valid certificate with only the name, course and date", async () => {
    rpc.mockResolvedValue({
      data: [{ nombre: "Ana Pérez", curso_title: "Ciberseguridad", completed_at: "2026-11-26T15:00:00Z" }],
    });
    await open("ab12-cd34-ef56");
    expect(rpc).toHaveBeenCalledWith("aprendizaje_verificar_certificado", { p_codigo: "AB12-CD34-EF56" });
    expect(screen.getByText("Certificado válido")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeTruthy();
    expect(screen.getByText("Ciberseguridad")).toBeTruthy();
    expect(screen.getByText(/26 de noviembre de 2026/)).toBeTruthy();
    expect(screen.getByText("Código AB12-CD34-EF56")).toBeTruthy();
  });

  it("says so when the code doesn't match any certificate", async () => {
    rpc.mockResolvedValue({ data: [] });
    await open("0000-0000-0000");
    expect(screen.getByRole("heading", { name: "No encontramos este certificado" })).toBeTruthy();
    expect(screen.queryByText("Certificado válido")).toBeNull();
  });
});
