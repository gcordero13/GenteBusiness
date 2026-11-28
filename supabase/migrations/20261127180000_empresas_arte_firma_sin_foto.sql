-- Email signatures: the "sin foto" version has its own art (no photo circle,
-- the big logo in its place; user request, 2026-11-27). Null = the "con foto"
-- art is used for both.
alter table public.companies
  add column if not exists firma_fondo_sin_foto_url text;
