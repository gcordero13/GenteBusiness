import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentPlanCalculator } from "./PaymentPlanCalculator";

const DEFAULT_DATES = {
  separationDate: "2026-11-22",
  installmentStartDate: "2026-12-22",
  installmentEndDate: "2027-11-22",
  disbursementDate: "2028-11-22",
};

function addFixedInstallment(index: number, date: string, amount: string) {
  fireEvent.click(screen.getByRole("button", { name: /Agregar cuota fija/ }));
  fireEvent.change(screen.getByLabelText(`Fecha de la cuota fija ${index}`), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(`Monto de la cuota fija ${index} (USD)`), { target: { value: amount } });
}

describe("PaymentPlanCalculator", () => {
  it("builds the sales team's example with fixed cuotas and copies it in the 3-column format", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(
      <PaymentPlanCalculator
        defaultDates={{
          separationDate: "2026-11-18",
          installmentStartDate: "2027-02-18",
          installmentEndDate: "2027-05-18",
          disbursementDate: "2027-06-18",
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Monto de la unidad (USD)"), { target: { value: "88413.90" } });
    fireEvent.change(screen.getByLabelText("Monto de separación (USD) — mín. $100"), { target: { value: "11968.40" } });
    addFixedInstallment(1, "2026-11-18", "1455");
    addFixedInstallment(2, "2027-01-18", "1455");
    addFixedInstallment(3, "2027-12-18", "1455");
    fireEvent.click(screen.getByRole("button", { name: "Generar plan de pagos" }));

    expect(screen.getByText("CUOTA 7 de 7")).toBeTruthy();
    expect(screen.getByText("Total en cuotas fijas")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Copiar plan/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe(
      [
        "18/11/2026\t11968.40\tSEPARACION INICIAL",
        "18/11/2026\t1455.00\tCUOTA 1 de 7",
        "18/01/2027\t1455.00\tCUOTA 2 de 7",
        "18/02/2027\t2547.69\tCUOTA 3 de 7",
        "18/03/2027\t2547.69\tCUOTA 4 de 7",
        "18/04/2027\t2547.69\tCUOTA 5 de 7",
        "18/05/2027\t2547.70\tCUOTA 6 de 7",
        "18/06/2027\t61889.73\tDESEMBOLSO (70%)",
        "18/12/2027\t1455.00\tCUOTA 7 de 7",
      ].join("\n"),
    );
  });

  it("shows a validation error for a fixed cuota without an amount", () => {
    render(<PaymentPlanCalculator defaultDates={DEFAULT_DATES} />);

    addFixedInstallment(1, "2027-06-15", "");
    fireEvent.click(screen.getByRole("button", { name: "Generar plan de pagos" }));

    expect(screen.getByText("Cada cuota fija debe tener un monto mayor a $0.")).toBeTruthy();
  });

  it("removes a fixed cuota", () => {
    render(<PaymentPlanCalculator defaultDates={DEFAULT_DATES} />);

    fireEvent.click(screen.getByRole("button", { name: /Agregar cuota fija/ }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar cuota fija 1" }));

    expect(screen.queryByLabelText("Fecha de la cuota fija 1")).toBeNull();
  });
});
