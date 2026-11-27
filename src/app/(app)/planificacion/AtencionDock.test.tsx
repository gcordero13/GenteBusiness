import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

const abrir = () => fireEvent.click(screen.getByRole("button", { name: /Necesitan tu atención/ }));

describe("AtencionDock", () => {
  it("sits at the bottom edge, minimized: only the title and the count", () => {
    render(<AtencionDock items={[ITEM]} hoy="2026-11-27" />);
    const dock = screen.getByRole("region", { name: "Necesitan tu atención" });
    // Pushed to the bottom of a screen-tall page, and stuck there when scrolling.
    expect(dock.className).toContain("mt-auto");
    expect(dock.className).toContain("sticky");
    expect(dock.className).toContain("bottom-0");
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Necesitan tu atención/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: /Conciliación bancaria/ })).toBeNull();
  });

  it("opens only when the person asks, and minimizes again", () => {
    render(<AtencionDock items={[ITEM]} hoy="2026-11-27" />);
    abrir();
    expect(screen.getByRole("link", { name: /Conciliación bancaria/ }).getAttribute("href")).toBe("/planificacion/proyectos/p1");
    expect(screen.getByText("Venció el 24 nov")).toBeTruthy();
    abrir();
    expect(screen.queryByRole("link", { name: /Conciliación bancaria/ })).toBeNull();
  });

  it("says so when nothing is urgent", () => {
    render(<AtencionDock items={[]} hoy="2026-11-27" />);
    abrir();
    expect(screen.getByText("Nada urgente por ahora. ¡Vas al día!")).toBeTruthy();
  });
});
