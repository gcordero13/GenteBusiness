# Plan de Pagos — pagos extraordinarios (diseño)

Fecha: 2026-11-22 · Página: `/plan-de-pagos` (pública, sin login)

## Objetivo

Permitir agregar, de forma opcional, uno o más pagos extraordinarios (fecha +
monto en USD) a un plan de pagos, y que el usuario elija en cada plan cómo
afectan al resto del plan. Sin pagos extraordinarios el plan queda idéntico al
actual.

## Reglas (el usuario elige una por plan)

Notación: `R` = remanente del 30% para cuotas (30% − separación − completivo),
`E` = suma de pagos extraordinarios, `n` = número de cuotas según las fechas,
`D` = desembolso base (precio − 30%).

| Modo | Cuotas | Desembolso | Límite |
|---|---|---|---|
| `reduce_installment` (por defecto) — bajar la cuota | `n` cuotas que suman `R − E` (la última absorbe el redondeo) | `D` | `E ≤ R` |
| `reduce_count` — menos cuotas | cuota base `floor(R / n)` (la misma que sin extraordinarios); `min(n, ceil((R − E) / base))` cuotas; la última absorbe la diferencia | `D` | `E ≤ R` |
| `reduce_disbursement` — bajar el desembolso | igual que sin extraordinarios | `D − E` | `E ≤ D` |

- Si `E = R` en los modos 1 y 2, no quedan cuotas: el plan no lista cuotas y
  muestra un aviso.
- Con el modo 3 y extraordinarios, la fila del desembolso se llama
  `DESEMBOLSO` (ya no es el 70%).

## Validaciones

- Cada pago: fecha obligatoria; monto > $0.
- Fecha estrictamente posterior a la separación y anterior al desembolso.
- Límites de la tabla anterior, con mensaje que indica ambos montos.

## Salida

- Cada pago es una fila `PAGO EXTRAORDINARIO`; todas las filas se ordenan por
  fecha (orden estable: en la misma fecha, la cuota va primero). El desembolso
  siempre es la última fila.
- "Copiar plan (Excel)" y "Exportar CSV" mantienen su formato actual.
- El resumen agrega "Pagos extraordinarios: $X".
- `warning: string | null` pasa a ser `warnings: string[]` (puede haber aviso
  de completivo y de "sin cuotas" a la vez).

## UI

Sección opcional "Pagos extraordinarios" con "+ Agregar pago" (fecha, monto,
quitar). El selector de modo aparece solo cuando hay al menos un pago.

## Pruebas

Tests unitarios en `src/lib/paymentPlan.test.ts` para cada modo, sus límites,
el caso sin cuotas, el orden de filas y que sin extraordinarios el resultado no
cambia.
