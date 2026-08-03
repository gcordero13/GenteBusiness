alter table public.maintenance_records
  add column type text not null default 'preventivo' check (type in ('preventivo', 'correctivo')),
  add column problema_reportado text,
  add column diagnostico text,
  add column solucion_aplicada text,
  add column repuestos_piezas text;
