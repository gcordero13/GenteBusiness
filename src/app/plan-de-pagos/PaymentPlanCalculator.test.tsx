import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentPlanCalculator } from "./PaymentPlanCalculator";

const DEFAULT_DATES = {
  separationDate: "2026-11-22",
  installmentStartDate: "2026-12-22",
  installmentEndDate: "2027-11-22",
  disbursementDate: "2028-11-22",
};

describe("PaymentPlanCalculator", () => {
  it("adds an extraordinary payment, applies the chosen rule and copies the plan", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<PaymentPlanCalculator defaultDates={DEFAULT_DATES} />);

    // The mode selector only appears once there is an extra payment.
    expect(screen.queryByLabelText("¿Qué hacer con los pagos extraordinarios?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Agregar pago/ }));
    fireEvent.change(screen.getByLabelText("Fecha del pago 1"), { target: { value: "2027-06-15" } });
    fireEvent.change(screen.getByLabelText("Monto (USD)"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("¿Qué hacer con los pagos extraordinarios?"), {
      target: { value: "reduce_disbursement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generar plan de pagos" }));

    expect(screen.getByText("PAGO EXTRAORDINARIO")).toBeTruthy();
    expect(screen.getByText("DESEMBOLSO")).toBeTruthy();
    expect(screen.getAllByText("$65,000.00").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Copiar plan/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied: string = writeText.mock.calls[0][0];
    expect(copied).toContain("15/06/2027\t5000.00\tPAGO EXTRAORDINARIO");
    expect(copied.split("\n").at(-1)).toBe("22/11/2028\t65000.00\tDESEMBOLSO");
  });

  it("shows a validation error for an extra payment without an amount", () => {
    render(<PaymentPlanCalculator defaultDates={DEFAULT_DATES} />);

    fireEvent.click(screen.getByRole("button", { name: /Agregar pago/ }));
    fireEvent.change(screen.getByLabelText("Fecha del pago 1"), { target: { value: "2027-06-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar plan de pagos" }));

    expect(screen.getByText("Cada pago extraordinario debe tener un monto mayor a $0.")).toBeTruthy();
  });

  it("removes an extra payment and hides the mode selector again", () => {
    render(<PaymentPlanCalculator defaultDates={DEFAULT_DATES} />);

    fireEvent.click(screen.getByRole("button", { name: /Agregar pago/ }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar pago extraordinario 1" }));

    expect(screen.queryByLabelText("Fecha del pago 1")).toBeNull();
    expect(screen.queryByLabelText("¿Qué hacer con los pagos extraordinarios?")).toBeNull();
  });
});
