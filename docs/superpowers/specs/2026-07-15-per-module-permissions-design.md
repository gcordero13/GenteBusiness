# Permisos por módulo — Diseño

## Contexto

El modelo actual de permisos es plano: cada `role_profile` tiene un único conjunto de 6 banderas (`can_view`, `can_add`, `can_edit`, `can_delete`, `can_deactivate`, `can_manage_platform`) que aplica a **toda** la plataforma por igual. El usuario pidió que cada perfil de rol pueda definir permisos **independientes por módulo** (Agenda, Usuarios, Perfiles de rol, Empresas, Departamentos, Actividades), agregando también un séptimo permiso, "Autorizar", reservado para un futuro módulo de solicitudes/RH (jefe autoriza → RH) que no se construye todavía.

## Alcance

### Incluido
- Tabla `modules` (catálogo de módulos, extensible sin migración de esquema para agregar módulos futuros a la lista — aunque conectar un módulo nuevo a datos reales sigue siendo trabajo de código).
- Tabla `role_profile_permissions`: una fila por (perfil de rol, módulo) con 7 banderas: `can_view`, `can_add`, `can_edit`, `can_delete`, `can_deactivate`, `can_manage`, `can_authorize`.
- Migración automática de los 3 perfiles existentes (Viewer, Editor, Super Admin) a la nueva estructura, preservando su nivel de acceso actual en los 6 módulos.
- Nuevas funciones `get_my_module_permissions(module_key)` (para checks de una sola pantalla/tabla) y `get_my_permissions()` (todas las filas del usuario, para el sidebar).
- Reescritura de **todas** las políticas RLS existentes (`role_profiles`, `app_users`, `companies`, `departments`, `contacts` + su trigger, `contact-photos` storage, `company_events`) para consultar el módulo correspondiente en vez del flag global.
- Pantalla "Perfiles de rol" rediseñada como una matriz (filas = módulos, columnas = permisos), con modo crear y editar.
- Sidebar: cada enlace de "Ajustes" se muestra según el permiso `can_manage` de **su propio módulo**, no un flag único compartido.

### Fuera de alcance
- El módulo real de "solicitudes/RH" con flujo de aprobación (empleado → jefe autoriza → RH) — "Autorizar" queda como una bandera reservada, sin lógica de flujo todavía.
- Permisos individuales por usuario (overrides) — se mantiene la decisión original del spec: los permisos viven solo en el perfil de rol asignado.

## Modelo de datos

### `modules`
| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| key | text único | identificador estable usado en código (`contacts`, `users`, `role_profiles`, `companies`, `departments`, `activities`) |
| label | text | nombre visible (`Agenda`, `Usuarios`, etc.) |
| created_at | timestamptz | default now() |

Semilla inicial: los 6 módulos existentes hoy en la plataforma.

### `role_profile_permissions`
| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| role_profile_id | uuid fk → role_profiles.id, on delete cascade | |
| module_id | uuid fk → modules.id, on delete cascade | |
| can_view / can_add / can_edit / can_delete / can_deactivate / can_manage / can_authorize | boolean, default false | mismos 6 permisos de antes + el nuevo "autorizar" |
| unique (role_profile_id, module_id) | | una fila por combinación |

`role_profiles` pierde sus 6 columnas de permisos planos (`can_view`...`can_manage_platform`) — solo conserva `id`, `name`, `created_at`. La fuente de verdad de permisos pasa a ser `role_profile_permissions`.

## Funciones de permisos

- `get_my_module_permissions(p_module_key text)`: reemplaza a `get_my_role_flags()`. Devuelve las 7 banderas del llamador para un módulo específico. Se usa en cada página/política que solo necesita el permiso de su propio módulo (igual patrón que antes, un parámetro más).
- `get_my_permissions()`: devuelve todas las filas (module_key + 7 banderas) del llamador en una sola consulta — se usa en el layout/sidebar, que necesita saber de varios módulos a la vez para decidir qué enlaces mostrar, sin hacer 6 llamadas RPC por render.

Ambas son `security definer`, mismo patrón que la función que reemplazan.

## Migración de datos

Para cada perfil de rol existente, se inserta una fila en `role_profile_permissions` por cada uno de los 6 módulos, copiando sus 6 banderas planas actuales tal cual (mismo valor en todos los módulos, ya que antes el flag era global) y `can_authorize = false` (nuevo, sin uso todavía). Así ningún perfil pierde acceso el día que se aplique el cambio.

## Reescritura de políticas RLS

Cada política que hoy consulta `get_my_role_flags()` pasa a consultar `get_my_module_permissions('<módulo correspondiente>')`:

| Tabla | Módulo |
|---|---|
| `role_profiles`, `role_profile_permissions` | `role_profiles` |
| `app_users` | `users` |
| `companies` | `companies` |
| `departments` | `departments` |
| `contacts` (+ trigger `enforce_contacts_update_permissions`) | `contacts` |
| `storage.objects` (bucket `contact-photos`) | `contacts` |
| `company_events` | `activities` |

`modules` tiene una sola política: cualquier usuario autenticado puede leerla (necesaria para renderizar la matriz de permisos); nadie puede escribirla desde la app.

## UI

- **Sidebar**: en vez de un solo `canManagePlatform`, recibe un flag `can_manage` por cada módulo de "Ajustes" (Usuarios, Perfiles de rol, Empresas, Departamentos, Actividades) y `can_view` de Agenda — cada enlace se muestra independientemente.
- **Perfiles de rol**: la pantalla pasa de 6 casillas planas a una tabla (filas = los 6 módulos, columnas = los 7 permisos) dentro del modal de crear/editar. La lista principal solo muestra el nombre del perfil con un botón de editar que abre el modal pre-llenado.
- El resto de las pantallas (Empresas, Departamentos, Usuarios, Actividades, Agenda) no cambian visualmente — solo cambia qué función RPC consultan para decidir si mostrar/permitir sus acciones.

## Notas de seguimiento

- "Autorizar" no dispara ningún comportamiento todavía — es una columna reservada para cuando se construya el módulo de solicitudes/RH.
- Si se agrega un módulo nuevo en el futuro, agregar la fila en `modules` es solo el primer paso; conectar RLS real y una pantalla para ese módulo sigue siendo trabajo de código, como con cualquier módulo actual.
