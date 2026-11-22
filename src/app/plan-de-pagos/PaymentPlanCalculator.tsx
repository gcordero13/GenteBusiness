"use client";

import { useRef, useState } from "react";
import { Check, Copy, Download, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildPaymentPlan,
  formatPlanCsv,
  formatPlanDate,
  formatPlanForClipboard,
  formatUsd,
  type PaymentPlanResult,
} from "@/lib/paymentPlan";

type GeneratedPlan = Extract<PaymentPlanResult, { ok: true }>;

interface DefaultDates {
  separationDate: string;
  installmentStartDate: string;
  installmentEndDate: string;
  disbursementDate: string;
}

const PERCENTAGE_OPTIONS = [
  { value: "0.05", label: "5% (requiere 25% en cuotas)" },
  { value: "0.10", label: "10% (requiere 20% en cuotas)" },
];

interface FixedInstallmentDraft {
  id: number;
  date: string;
  amount: string;
}

// navigator.clipboard only exists in secure contexts (https/localhost); fall
// back to the legacy execCommand path so copying still works elsewhere.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function downloadCsv(content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plan_de_pagos.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function PaymentPlanCalculator({ defaultDates }: { defaultDates: DefaultDates }) {
  const [price, setPrice] = useState("100000");
  const [initialPercentage, setInitialPercentage] = useState("0.05");
  const [separation, setSeparation] = useState("5000");
  const [separationDate, setSeparationDate] = useState(defaultDates.separationDate);
  const [installmentStartDate, setInstallmentStartDate] = useState(defaultDates.installmentStartDate);
  const [installmentEndDate, setInstallmentEndDate] = useState(defaultDates.installmentEndDate);
  const [disbursementDate, setDisbursementDate] = useState(defaultDates.disbursementDate);
  const [fixedInstallments, setFixedInstallments] = useState<FixedInstallmentDraft[]>([]);
  const nextFixedId = useRef(1);

  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  function generate() {
    const result = buildPaymentPlan({
      price: parseFloat(price),
      separation: parseFloat(separation),
      initialPercentage: parseFloat(initialPercentage),
      separationDate,
      installmentStartDate,
      installmentEndDate,
      disbursementDate,
      fixedInstallments: fixedInstallments.map((f) => ({ date: f.date, amount: parseFloat(f.amount) })),
    });
    setCopyStatus("idle");
    if (!result.ok) {
      setError(result.error);
      setPlan(null);
      return;
    }
    setError(null);
    setPlan(result);
  }

  function addFixedInstallment() {
    const id = nextFixedId.current++;
    setFixedInstallments((prev) => [...prev, { id, date: "", amount: "" }]);
  }

  function updateFixedInstallment(id: number, patch: Partial<Omit<FixedInstallmentDraft, "id">>) {
    setFixedInstallments((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeFixedInstallment(id: number) {
    setFixedInstallments((prev) => prev.filter((f) => f.id !== id));
  }

  async function copyPlan() {
    if (!plan) return;
    const copied = await copyText(formatPlanForClipboard(plan.rows));
    setCopyStatus(copied ? "copied" : "failed");
    if (copied) setTimeout(() => setCopyStatus("idle"), 2500);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="price">Monto de la unidad (USD)</Label>
            <Input
              id="price"
              type="number"
              inputMode="decimal"
              min={1000}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ej: 150000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="initialPercentage">Porcentaje inicial requerido (mín.)</Label>
            <select
              id="initialPercentage"
              className={selectClassName}
              value={initialPercentage}
              onChange={(e) => setInitialPercentage(e.target.value)}
            >
              {PERCENTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="separation">Monto de separación (USD) — mín. $100</Label>
            <Input
              id="separation"
              type="number"
              inputMode="decimal"
              min={0}
              value={separation}
              onChange={(e) => setSeparation(e.target.value)}
              placeholder="Ej: 5000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="separationDate">Fecha de separación (día del depósito)</Label>
            <Input
              id="separationDate"
              type="date"
              value={separationDate}
              onChange={(e) => setSeparationDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="installmentStartDate">Inicio de cuotas (primer pago mensual)</Label>
            <Input
              id="installmentStartDate"
              type="date"
              value={installmentStartDate}
              onChange={(e) => setInstallmentStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="installmentEndDate">Fin de cuotas</Label>
            <Input
              id="installmentEndDate"
              type="date"
              value={installmentEndDate}
              onChange={(e) => setInstallmentEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="disbursementDate">Fecha de desembolso (70%)</Label>
            <Input
              id="disbursementDate"
              type="date"
              value={disbursementDate}
              onChange={(e) => setDisbursementDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Cuotas con monto fijo (opcional)</h2>
              <p className="text-xs text-muted-foreground">
                Si la fecha cae en un mes del rango, reemplaza la cuota de ese mes; si cae fuera (incluso después del
                desembolso), se agrega como cuota adicional. Las demás cuotas se calculan para completar el 30%.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addFixedInstallment}>
              <Plus data-icon="inline-start" />
              Agregar cuota fija
            </Button>
          </div>

          {fixedInstallments.map((fixed, index) => (
            <div key={fixed.id} className="flex flex-wrap items-end gap-2">
              <div className="min-w-36 flex-1 space-y-1.5">
                <Label htmlFor={`fixed-date-${fixed.id}`}>Fecha de la cuota fija {index + 1}</Label>
                <Input
                  id={`fixed-date-${fixed.id}`}
                  type="date"
                  value={fixed.date}
                  onChange={(e) => updateFixedInstallment(fixed.id, { date: e.target.value })}
                />
              </div>
              <div className="min-w-36 flex-1 space-y-1.5">
                <Label htmlFor={`fixed-amount-${fixed.id}`}>Monto de la cuota fija {index + 1} (USD)</Label>
                <Input
                  id={`fixed-amount-${fixed.id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={fixed.amount}
                  onChange={(e) => updateFixedInstallment(fixed.id, { amount: e.target.value })}
                  placeholder="Ej: 1455"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFixedInstallment(fixed.id)}
                aria-label={`Quitar cuota fija ${index + 1}`}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="lg" onClick={generate} className="min-w-40 flex-1 sm:flex-none">
            Generar plan de pagos
          </Button>
          <Button size="lg" variant="outline" onClick={copyPlan} disabled={!plan} className="min-w-40 flex-1 sm:flex-none">
            {copyStatus === "copied" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copyStatus === "copied" ? "¡Plan copiado!" : "Copiar plan (Excel)"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => plan && downloadCsv(formatPlanCsv(plan.rows))}
            disabled={!plan}
            className="min-w-40 flex-1 sm:flex-none"
          >
            <Download data-icon="inline-start" />
            Exportar CSV
          </Button>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-destructive">{error}</p>}
        {plan?.warnings.map((warning) => (
          <p key={warning} className="mt-4 text-sm font-medium text-amber-700 dark:text-amber-300">
            {warning}
          </p>
        ))}
        {copyStatus === "failed" && (
          <p className="mt-4 text-sm font-medium text-destructive">
            No se pudo copiar automáticamente. Selecciona la tabla y cópiala manualmente.
          </p>
        )}
      </section>

      {plan && (
        <>
          <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">Resumen del cálculo</h2>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <SummaryItem label="Total inicial requerido (30%)" value={formatUsd(plan.summary.totalTarget)} />
              <SummaryItem label="Separación + 5/10%" value={formatUsd(plan.summary.initialPaid)} />
              <SummaryItem label="Remanente para cuotas" value={formatUsd(plan.summary.remainingForInstallments)} />
              <SummaryItem label="Número de cuotas" value={String(plan.summary.installmentCount)} />
              {plan.summary.fixedInstallmentsTotal > 0 && (
                <SummaryItem label="Total en cuotas fijas" value={formatUsd(plan.summary.fixedInstallmentsTotal)} />
              )}
              <SummaryItem
                label={plan.summary.fixedInstallmentsTotal > 0 ? "Cuota calculada" : "Cuota mensual"}
                value={formatUsd(plan.summary.monthlyInstallment)}
                valueClassName="text-lg text-emerald-600 dark:text-emerald-400"
              />
              <SummaryItem
                label="Desembolso (70%)"
                value={formatUsd(plan.summary.disbursement)}
                valueClassName="text-lg text-[#04B1AF]"
              />
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">Detalle del plan de pagos</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Monto (USD)</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.rows.map((row, i) => (
                  <TableRow key={`${row.date}-${i}`}>
                    <TableCell className="tabular-nums">{formatPlanDate(row.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(row.amount)}</TableCell>
                    <TableCell>{row.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryItem({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold tabular-nums text-foreground ${valueClassName ?? ""}`}>{value}</dd>
    </div>
  );
}
