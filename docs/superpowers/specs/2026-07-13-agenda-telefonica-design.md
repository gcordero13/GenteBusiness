# Agenda Telefónica — Diseño

## Contexto

GenteBusiness es una plataforma nueva (repo vacío al iniciar este proyecto) para un holding empresarial (varias empresas/subsidiarias comparten el mismo directorio). El primer módulo a construir es una agenda telefónica de contactos internos. La intención declarada del usuario es que esta plataforma crezca con más aplicaciones en el futuro, por lo que el modelo de datos y el sistema de roles se diseñan pensando en esa extensibilidad, pero **solo se construye la agenda telefónica en este proyecto**.

Backend: Supabase (ya conectado al proyecto, credenciales se configuran vía `.env.local`, nunca en el chat ni en el repo).

## Alcance

### Incluido
- Autenticación por correo/clave (Supabase Auth) restringida a correos dados de alta en la plataforma
- Restablecimiento de clave vía correo (flujo estándar de Supabase)
- Sistema de roles/perfiles configurable (no roles fijos en código)
- CRUD de contactos con los campos especificados
- Buscador/filtro por nombre, empresa, departamento
- Widget de próximos 5 cumpleaños
- Enlace directo a WhatsApp (si aplica) y correo desde la ficha de contacto
- Árbol organizacional (jefe directo / "reporta a") como lista jerárquica expandible
- Importación y exportación masiva de contactos (CSV/Excel)
- Fotos de perfil opcionales (Supabase Storage)
- Distinción entre "anular" (desactivar, reversible) y "eliminar" (borrado permanente, irreversible)
- Script SQL de bootstrap para asignar el primer Super Admin

### Fuera de alcance (explícitamente pospuesto)
- Cualquier otro módulo/aplicación dentro de la plataforma más allá de la agenda telefónica
- Diagrama visual tipo organigrama gráfico (nodos y líneas) — se deja la lista jerárquica expandible como base que no requiere cambios de modelo de datos si se agrega después
- Permisos individuales por usuario (overrides) — los permisos viven únicamente en el perfil de rol asignado
- Auto-registro de usuarios (abierto o restringido por dominio)

## Modelo de datos

Todas las tablas viven en el esquema `public` de Supabase/Postgres.

### `companies`
| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| name | text | nombre de la empresa del holding |
| created_at | timestamptz | default now() |

### `departments`
| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| name | text | |
| company_id | uuid fk → companies.id | |
| created_at | timestamptz | default now() |

### `role_profiles`
Perfiles de rol configurables (no un enum fijo). Semillas iniciales al desplegar: `Viewer`, `Editor`, `Super Admin`. Un usuario con `can_manage_platform = true` puede crear, editar o desactivar perfiles adicionales.

| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| name | text | único |
| can_view | boolean | ver contactos |
| can_add | boolean | crear contactos (incluye import) |
| can_edit | boolean | editar contactos existentes (incluye import de actualización) |
| can_delete | boolean | borrado permanente |
| can_deactivate | boolean | anular (soft-delete) / reactivar |
| can_manage_platform | boolean | gestionar perfiles de rol, asignar perfiles a usuarios, gestionar empresas/departamentos |
| created_at | timestamptz | default now() |

Valores semilla recomendados:
- `Viewer`: solo `can_view = true`
- `Editor`: `can_view, can_add, can_edit, can_deactivate = true`; `can_delete, can_manage_platform = false`
- `Super Admin`: todos los flags en `true`

### `app_users`
Allowlist de correos con acceso a la plataforma. Solo los correos presentes aquí pueden iniciar sesión o solicitar restablecimiento de clave. El `id` coincide con `auth.users.id` de Supabase Auth una vez que el usuario acepta/crea su cuenta.

| columna | tipo | notas |
|---|---|---|
| id | uuid pk | = auth.users.id cuando exista la cuenta |
| email | text | único, minúsculas |
| role_profile_id | uuid fk → role_profiles.id | |
| full_name | text | opcional, nombre de quien inicia sesión |
| created_at | timestamptz | default now() |

### `contacts`
| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| first_name | text | |
| last_name | text | |
| email | text | |
| extension | text | |
| fleet_phone | text | número de teléfono/radio de flota |
| has_whatsapp | boolean | default false; si true, el teléfono de flota abre WhatsApp |
| department_id | uuid fk → departments.id | |
| company_id | uuid fk → companies.id | |
| position | text | puesto |
| photo_url | text | nullable, URL en Supabase Storage |
| reports_to_id | uuid fk → contacts.id, nullable | jefe directo (auto-referencia) |
| birth_date | date | nullable |
| status | text | `active` \| `deactivated` (anulado) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

## Roles y permisos (seguridad)

Row Level Security (RLS) en Postgres es la fuente de verdad de los permisos; Next.js valida en paralelo solo para ocultar/mostrar controles en la UI (no como única defensa).

Reglas por tabla `contacts`:
- `SELECT`: requiere `can_view = true` en el perfil del usuario autenticado
- `INSERT`: requiere `can_add = true` (incluye filas creadas por import masivo)
- `UPDATE` de campos de contenido: requiere `can_edit = true`
- `UPDATE` de `status` (anular/reactivar): requiere `can_deactivate = true`
- `DELETE`: requiere `can_delete = true`

Reglas para `role_profiles`, `app_users`, `companies`, `departments`: cualquier `INSERT/UPDATE/DELETE` requiere `can_manage_platform = true`. `SELECT` sobre `role_profiles`/`app_users` también restringido a `can_manage_platform = true` (no es información que todos los usuarios deban ver).

La verificación del perfil del usuario se hace mediante una función SQL (`security definer`) que busca el `role_profile_id` del usuario autenticado (`auth.uid()`) en `app_users` y devuelve sus flags, reutilizada en todas las políticas.

## Autenticación

- Supabase Auth, método correo + clave
- Un usuario solo puede iniciar sesión o pedir "olvidé mi clave" si su correo ya existe en `app_users` (dado de alta por alguien con `can_manage_platform`, individualmente o vía import)
- Restablecimiento de clave: flujo estándar de Supabase (enlace de un solo uso enviado al correo)
- No hay auto-registro público

## Funcionalidades de la agenda

### Buscador
Barra de búsqueda por nombre (texto libre) + filtros desplegables por empresa y departamento. Filtra en tiempo real sobre la lista visible (contactos con `status = active` por defecto; los perfiles con `can_deactivate`/`can_delete` pueden alternar a ver también los anulados).

### Próximos cumpleaños
Widget en la parte superior del directorio mostrando los 5 contactos cuya fecha de cumpleaños (mes/día, ignorando año) esté más próxima a partir de hoy, con manejo de fin de año (ej. si hoy es 20 de diciembre, el 5 de enero cuenta como "próximo"). Si ningún contacto tiene `birth_date` cargada, el widget no se muestra.

### WhatsApp y correo
- Clic en el correo del contacto → abre `mailto:{email}`
- Clic en el teléfono de flota:
  - si `has_whatsapp = true` → abre `https://wa.me/{numero_normalizado}` en una pestaña nueva
  - si `has_whatsapp = false` → solo muestra el número (no es clicable como WhatsApp)

### Árbol organizacional
Vista de lista jerárquica expandible basada en `reports_to_id`: cada contacto que tiene subordinados (otros contactos apuntando a él vía `reports_to_id`) se puede expandir para revelar su equipo. Accesible desde la ficha de un contacto o como vista separada "Organigrama".

### Importación y exportación
- **Importar**: subir un archivo CSV/Excel con columnas mapeadas a los campos de `contacts`; permite crear contactos nuevos y actualizar existentes (por coincidencia de correo). Requiere `can_add` (para filas nuevas) y `can_edit` (para actualizaciones); se valida fila por fila y se reporta un resumen de éxitos/errores.
- **Exportar**: descarga en CSV/Excel del listado de contactos actualmente filtrado/visible según los permisos y filtros activos del usuario.

## Fotos de perfil

Bucket de Supabase Storage `contact-photos`. Subida opcional al crear/editar un contacto. Lectura pública dentro de la app (uso interno de la empresa); escritura (subida/reemplazo/borrado de archivo) restringida a usuarios con `can_add`/`can_edit` mediante políticas de Storage.

## Bootstrap del primer Super Admin

Se entrega un script SQL (para correr manualmente en el SQL Editor de Supabase) que, dado el correo de un usuario ya existente en Supabase Auth, hace upsert en `app_users` asignándole el perfil `Super Admin`. No se ejecuta automáticamente ni se conecta a ningún flujo de la app — lo corre el usuario cuando lo necesite, después de haberse registrado/creado su cuenta en Supabase Auth.

## Fuera de alcance / notas de seguridad

- El usuario compartió una contraseña en texto plano durante la conversación de diseño; se le indicó rotarla y no fue usada ni almacenada. Las credenciales reales de Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) se configurarán directamente en `.env.local` durante la implementación, no en el chat.
