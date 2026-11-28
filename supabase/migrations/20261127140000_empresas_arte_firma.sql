-- Email signatures (user request, 2026-11-27): each company can upload its
-- signature art in Empresas - the background without name, photo or data -
-- and every contact of that company gets it, with their photo and data on
-- top. firma_plantilla says where those go (the three current designs);
-- null = chosen by the company's name.
alter table public.companies
  add column if not exists firma_fondo_url text,
  add column if not exists firma_plantilla text check (firma_plantilla in ('sbc', 'jsc', 'kexford'));

-- The art is a big image (logos were capped at 2 MB): allow up to 10 MB and WebP.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
where id = 'company-logos';
