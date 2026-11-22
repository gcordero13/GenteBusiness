import { describe, expect, it } from "vitest";
import {
  buildPaymentPlan,
  formatPlanForClipboard,
  formatPlanCsv,
  getDefaultPlanDates,
  type PaymentPlanInput,
} from "./paymentPlan";

const BASE: PaymentPlanInput = {
  price: 100000,
  separation: 5000,
  initialPercentage: 0.05,
  separationDate: "2026-11-22",
  installmentStartDate: "2026-12-22",
  installmentEndDate: "2027-11-22",
  disbursementDate: "2028-11-22",
};

function ok(input: PaymentPlanInput) {
  const result = buildPaymentPlan(input);
  if (!result.ok) throw new Error(`expected a plan, got error: ${result.error}`);
  return result;
}

describe("buildPaymentPlan", () => {
  it("splits the 30% into separation + monthly installments and the 70% disbursement", () => {
    const { rows, summary, warning } = ok(BASE);

    expect(warning).toBeNull();
    expect(summary).toMatchObject({
      totalTarget: 30000,
      initialPaid: 5000,
      remainingForInstallments: 25000,
      installmentCount: 12,
      monthlyInstallment: 2083.33,
      disbursement: 70000,
    });

    // separation + 12 installments + disbursement (no bridge: separation already covers 5%)
    expect(rows).toHaveLength(14);
    expect(rows[0]).toEqual({ date: "2026-11-22", amount: 5000, description: "SEPARACION INICIAL" });
    expect(rows[1]).toEqual({ date: "2026-12-22", amount: 2083.33, description: "CUOTA 1 de 12" });
    // last installment absorbs the rounding remainder
    expect(rows[12]).toEqual({ date: "2027-11-22", amount: 2083.37, description: "CUOTA 12 de 12" });
    expect(rows[13]).toEqual({ date: "2028-11-22", amount: 70000, description: "DESEMBOLSO (70%)" });

    const total = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
    expect(total).toBe(100000);
  });

  it("adds a bridge payment 20 days after separation to complete the 10%", () => {
    const { rows, summary } = ok({ ...BASE, initialPercentage: 0.1 });

    expect(rows[1]).toEqual({ date: "2026-12-12", amount: 5000, description: "PAGO PUENTE COMPLETA 10%" });
    expect(summary.initialPaid).toBe(10000);
    expect(summary.remainingForInstallments).toBe(20000);
    expect(summary.monthlyInstallment).toBe(1666.66);
    expect(rows.at(-2)).toEqual({ date: "2027-11-22", amount: 1666.74, description: "CUOTA 12 de 12" });
    expect(summary.bridgeDueDate).toBe("2026-12-12");
  });

  it("does not count an extra installment when the end day is before the start day", () => {
    const { summary } = ok({ ...BASE, installmentEndDate: "2027-11-21" });
    expect(summary.installmentCount).toBe(11);
  });

  it("clamps installment dates to the last day of shorter months", () => {
    const { rows } = ok({
      ...BASE,
      separationDate: "2026-12-15",
      installmentStartDate: "2027-01-31",
      installmentEndDate: "2027-04-30",
    });
    const installmentDates = rows.filter((r) => r.description.startsWith("CUOTA")).map((r) => r.date);
    expect(installmentDates).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("warns (but still builds the plan) when installments start before the bridge payment is due", () => {
    const result = ok({ ...BASE, initialPercentage: 0.1, installmentStartDate: "2026-12-01" });
    expect(result.warning).toContain("12/12/2026");
  });

  it.each<[string, Partial<PaymentPlanInput>, string]>([
    ["non-positive price", { price: 0 }, "El monto de la unidad debe ser positivo."],
    ["NaN price", { price: Number.NaN }, "El monto de la unidad debe ser positivo."],
    ["separation under $100", { separation: 99 }, "El monto de separación debe ser al menos $100."],
    ["missing date", { disbursementDate: "" }, "Debe seleccionar todas las fechas."],
    [
      "end before start",
      { installmentEndDate: "2026-12-22" },
      "La fecha de fin de cuotas debe ser posterior a la fecha de inicio.",
    ],
    [
      "disbursement before end",
      { disbursementDate: "2027-11-22" },
      "La fecha de desembolso debe ser posterior a la fecha de fin de cuotas.",
    ],
    [
      "start not after separation",
      { separationDate: "2026-12-22" },
      "La fecha de inicio de cuotas debe ser posterior a la fecha de separación.",
    ],
    [
      "separation exceeding the 30%",
      { separation: 40000 },
      "La separación y el 5/10% exceden el 30% requerido. Ajuste el monto de separación.",
    ],
  ])("rejects %s", (_label, override, error) => {
    expect(buildPaymentPlan({ ...BASE, ...override })).toEqual({ ok: false, error });
  });
});

describe("formatPlanForClipboard", () => {
  it("produces tab-separated date/amount/description lines ready to paste into Excel", () => {
    const { rows } = ok({ ...BASE, initialPercentage: 0.1 });
    const lines = formatPlanForClipboard(rows).split("\n");

    expect(lines[0]).toBe("22/11/2026\t5000.00\tSEPARACION INICIAL");
    expect(lines[1]).toBe("12/12/2026\t5000.00\tPAGO PUENTE COMPLETA 10%");
    expect(lines[2]).toBe("22/12/2026\t1666.66\tCUOTA 1 de 12");
    expect(lines.at(-1)).toBe("22/11/2028\t70000.00\tDESEMBOLSO (70%)");
    expect(lines).toHaveLength(rows.length);
  });
});

describe("formatPlanCsv", () => {
  it("adds a header and comma-separates each row", () => {
    const { rows } = ok(BASE);
    const lines = formatPlanCsv(rows).split("\n");
    expect(lines[0]).toBe("Fecha,Monto,Observacion");
    expect(lines[1]).toBe("22/11/2026,5000.00,SEPARACION INICIAL");
  });
});

describe("getDefaultPlanDates", () => {
  it("defaults to today, +1 month, +1 year and +2 years", () => {
    expect(getDefaultPlanDates("2026-11-22")).toEqual({
      separationDate: "2026-11-22",
      installmentStartDate: "2026-12-22",
      installmentEndDate: "2027-11-22",
      disbursementDate: "2028-11-22",
    });
  });

  it("clamps month-end defaults instead of overflowing into the next month", () => {
    expect(getDefaultPlanDates("2027-01-31").installmentStartDate).toBe("2027-02-28");
  });
});
