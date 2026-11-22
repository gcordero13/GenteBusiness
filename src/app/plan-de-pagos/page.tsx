import type { Metadata } from "next";
import { connection } from "next/server";
import { getBusinessToday } from "@/lib/contacts";
import { getDefaultPlanDates } from "@/lib/paymentPlan";
import { PaymentPlanCalculator } from "./PaymentPlanCalculator";

// Public page (no login) - whitelisted in src/middleware.ts so it can be
// shared as a plain link with people who don't have a platform account.
export const metadata: Metadata = {
  title: "Plan de Pagos | Gente Sánchez Business",
  robots: { index: false, follow: false },
};

export default async function PaymentPlanPage() {
  // Default dates are relative to "today", so this must render per request -
  // otherwise it would be prerendered at build time with a stale date.
  await connection();
  const todayIso = getBusinessToday().toISOString().slice(0, 10);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Generador de Plan de Pagos</h1>
          <p className="text-sm text-muted-foreground">
            30% durante la construcción (separación, completivo del 5%/10% y cuotas) + 70% al desembolso. Montos
            en dólares estadounidenses (USD).
          </p>
        </div>
        <PaymentPlanCalculator defaultDates={getDefaultPlanDates(todayIso)} />
      </div>
    </div>
  );
}
