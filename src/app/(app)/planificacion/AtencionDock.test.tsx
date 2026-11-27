import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AtencionDock, type AtencionItem } from "./AtencionDock";

const ITEM: AtencionItem = {
  id: "t1",
  title: "Conciliación bancaria",
  proyectoId: "p1",
  proyectoName: "Cierre fiscal",
  estadoName: "En proceso",
  estadoColor: "#3b82f6",
  priority: "alta",
  dueDate: "2026-11-24",
};

describe("AtencionDock", () => {
  beforeEach(() => localStorage.clear());

  it("is docked at the bottom and lists what needs attention", () => {
    render(<AtencionDock items={[ITEM]} hoy="2026-11-27" />);
    const dock = screen.getByRole("region", { name: "Necesitan tu atención" });
    expect(dock.className).toContain("sticky");
    expect(dock.className).toContain("bottom-0");
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Conciliación bancaria/ }).getAttribute("href")).toBe("/planificacion/proyectos/p1");
    expect(screen.getByText("Venció el 24 nov")).toBeTruthy();
  });

  it("folds the list and remembers it", () => {
    render(<AtencionDock items={[ITEM]} hoy="2026-11-27" />);
    fireEvent.click(screen.getByRole("button", { name: /Necesitan tu atención/ }));
    expect(screen.queryByRole("link", { name: /Conciliación bancaria/ })).toBeNull();
    expect(localStorage.getItem("planificacion-atencion-abierta")).toBe("false");
  });

  it("says so when nothing is urgent", () => {
    render(<AtencionDock items={[]} hoy="2026-11-27" />);
    expect(screen.getByText("Nada urgente por ahora. ¡Vas al día!")).toBeTruthy();
  });
});
