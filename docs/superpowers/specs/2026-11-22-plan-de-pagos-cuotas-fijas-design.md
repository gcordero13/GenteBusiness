# Plan de Pagos — cuotas con monto fijo (diseño)

Fecha: 2026-11-22 · Página: `/plan-de-pagos` (pública, sin login)

> Reemplaza la primera versión de este diseño ("pagos extraordinarios" como
> filas aparte con 3 reglas a elegir). Ventas aclaró con un plan real que no
> son abonos aparte, sino cuotas del plan con un monto mayor o distinto.

## Modelo

- El vendedor agrega, de forma opcional, **cuotas con monto fijo**
  (fecha + monto en USD).
- Si la fecha de una cuota fija cae en un **mes** del rango mensual
  (inicio–fin de cuotas), **reemplaza** la cuota calculada de ese mes (se
  compara por mes, no por día exacto).
- Si cae **fuera** del rango (antes del inicio o después del fin, incluso
  después del desembolso), se **agrega** como cuota adicional.
- Las cuotas del rango no reemplazadas son las **cuotas calculadas**: se
  reparten `R − F` (remanente del 30% menos la suma de cuotas fijas) en
  centavos; la última absorbe el redondeo.
- Todas las filas se ordenan por fecha. En la misma fecha: separación,
  completivo, cuotas, desembolso. Las cuotas se numeran `CUOTA i de N` en orden
  de fecha (fijas y calculadas juntas). El desembolso queda donde le toque por
  fecha y siempre es el 70%.
- Sin cuotas fijas, el plan es idéntico al original.

## Validaciones

- Cada cuota fija: fecha obligatoria; monto > $0; fecha no anterior a la
  separación (la misma fecha sí se permite).
- `F > R` → error indicando ambos montos.
- Si todas las cuotas del rango son fijas y `F < R` → error indicando cuánto
  falta.
- Si `F = R` y quedan meses calculados → aviso ("no quedan cuotas
  calculadas") y no se listan cuotas calculadas.

## Salida

"Copiar plan (Excel)" y "Exportar CSV" mantienen 3 columnas: fecha, monto,
observación. El resumen muestra "Total en cuotas fijas" y "Cuota calculada".

## Caso de referencia (plan real de ventas)

Unidad $88,413.90; separación $11,968.40 (18/11/2026); cuotas calculadas
feb–may 2027; desembolso 18/06/2027; cuotas fijas de $1,455 el 18/11/2026,
18/01/2027 y 18/12/2027 → 9 filas con el desembolso antes de la última cuota.
Está cubierto por los tests de `src/lib/paymentPlan.test.ts` y del componente.
