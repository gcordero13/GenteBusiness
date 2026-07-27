# Logos de empresas y de la plataforma — Diseño

**Fecha:** 2026-07-27
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Hoy la aplicación no tiene ningún concepto de logo/imagen para las empresas gestionadas en `/companies`, ni para la marca de la plataforma "Gente Sánchez Business" (que solo aparece como texto en el sidebar, login, forgot-password, reset-password, metadata y manifest). El usuario quiere poder subir y gestionar ambos logos desde la interfaz, sin tocar código cada vez que cambien.

## Alcance

1. **Logo por empresa**: cada registro en `companies` puede tener un logo, gestionado desde el formulario de edición/creación existente (`CompanyForm`), visible como miniatura en la tabla de `/companies`.
2. **Logo de la plataforma**: una imagen única gestionable desde `/settings`, usada en las pantallas de acceso (login, forgot-password, reset-password) y como favicon. El sidebar interno se mantiene solo con texto (decisión explícita del usuario — más compacto para uso diario).

Fuera de alcance: mostrar el logo de empresa en otros listados (contactos, actividades) — el usuario confirmó que solo debe verse en la tabla de Empresas y en su formulario.

## Modelo de datos y almacenamiento

### Logo por empresa
- Nueva columna `logo_url text` (nullable) en la tabla `companies`, vía migración de Supabase.
- Nuevo bucket de Supabase Storage **`company-logos`** (público), siguiendo el mismo patrón que `contact-photos` (`ContactForm.tsx`): el cliente sube el archivo, obtiene la URL pública con `getPublicUrl()`, y esa URL se guarda junto con el resto de los campos de la empresa vía el server action existente de crear/editar empresa.
- Bucket configurado con `file_size_limit = 2097152` (2 MB) y `allowed_mime_types = ['image/png', 'image/jpeg', 'image/svg+xml']` — la validación de tamaño/tipo ocurre a nivel de bucket, no duplicada en aplicación.
- RLS de storage para el bucket: insert/update/delete solo si `get_my_module_permissions('companies').can_manage` es verdadero (mismo criterio que ya protege insert/update/delete sobre la tabla `companies`); select público (el bucket es público, así que las URLs son de lectura libre igualmente).

### Logo de la plataforma
- No existe hoy una tabla genérica de "ajustes de plataforma" (el SMTP se gestiona vía Management API de Supabase, fuera de la base de datos del proyecto, y no aplica aquí). Se crea una tabla nueva **`platform_settings`** con una única fila (constraint que impide más de una fila, p. ej. columna `id boolean primary key default true` con `check (id)`), con columna `logo_url text` nullable.
- RLS: `select` público/anónimo (necesario para que el login, sin sesión, pueda leer la URL antes de autenticar); `update` restringido a `get_my_module_permissions('settings').can_manage` (hoy solo rol Super Admin — mismo criterio que ya protege toda la página `/settings`).
- Reutiliza el bucket **`company-logos`** con prefijo de carpeta `platform/` (evita crear un segundo bucket solo para una imagen), mismas restricciones de tamaño/tipo. RLS de ese prefijo restringida a `can_manage` de `settings`.

## Componentes de UI

### `CompanyForm.tsx`
- Nuevo campo de imagen: input `type="file" accept="image/png,image/jpeg,image/svg+xml"` con vista previa del logo actual (o placeholder tipo ícono de edificio si no tiene). Sigue el mismo patrón que el input de foto en `ContactForm.tsx`.
- Al enviar el formulario: si se seleccionó un archivo nuevo, se sube primero a `company-logos`, se obtiene la URL pública, y se incluye `logo_url` en el payload del server action de crear/editar.

### `/companies` (tabla de empresas)
- Cada fila muestra una miniatura pequeña (p. ej. 32×32) del logo junto al nombre de la empresa, o un ícono de edificio por defecto si `logo_url` es null.

### `/settings` (Configuración)
- Nueva sección "Marca" en la misma página, separada visualmente del formulario de SMTP existente. Componente nuevo `PlatformLogoForm` (client component): vista previa del logo actual, input de archivo, botón "Guardar". Mismo gate de acceso (`can_manage` de `settings`) que ya protege toda la página — no se necesita permiso nuevo.
- Al guardar: sube a `company-logos/platform/`, obtiene URL pública, hace upsert de la fila única en `platform_settings` vía nuevo server action `savePlatformLogo`.

### Pantallas de acceso (login, forgot-password, reset-password)
- El bloque actual con el ícono `Building2` en gradiente se reemplaza por: si `platform_settings.logo_url` existe, mostrar `<img>` con esa URL; si no, mantener el ícono `Building2` actual como fallback. Estas páginas hacen fetch server-side (server component) del `logo_url` vía cliente Supabase anónimo, ya que RLS permite lectura pública de `platform_settings`.

### Favicon
- Nuevo route dinámico (`src/app/icon.tsx` o `src/app/icon/route.ts`, convención de Next.js para iconos) que lee `platform_settings.logo_url` y devuelve/redirige a esa imagen; si no hay logo configurado, sirve el ícono estático actual como respaldo. `src/app/manifest.ts` se actualiza para apuntar a este ícono dinámico.

## Manejo de errores

- Si la subida a Storage falla (red, tamaño excedido, tipo no permitido), el formulario correspondiente (`CompanyForm` o `PlatformLogoForm`) muestra un mensaje de error inline y no continúa con el guardado del resto de los datos.
- Si `platform_settings` no tiene fila aún (plataforma nueva sin logo subido) o `companies.logo_url` es null, todas las pantallas caen a sus respectivos fallbacks (ícono `Building2` para plataforma, ícono de edificio genérico para empresas) — nunca se rompe la UI por falta de logo.

## Pruebas

- Migración: verificar que la columna `logo_url` se agrega a `companies` y que `platform_settings` respeta la restricción de fila única.
- RLS: confirmar que un usuario sin `can_manage` en `companies` no puede subir/cambiar el logo de una empresa (insert/update de storage rechazado), y que un usuario sin `can_manage` en `settings` no puede cambiar el logo de plataforma.
- UI manual: subir logo de empresa y verificar que aparece en la tabla de `/companies` y en el formulario; subir logo de plataforma y verificar que aparece en login/forgot-password/reset-password y como favicon; verificar fallbacks cuando no hay logo.
