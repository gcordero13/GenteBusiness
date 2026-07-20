# Barra lateral de navegación — Diseño

## Contexto

Hasta ahora cada página autenticada (`/`, `/contacts`, `/users`, `/role-profiles`, `/companies`, `/departments`) es una isla: no hay forma de moverse entre secciones salvo enlaces sueltos en la home page. El usuario pidió un menú que organice todas las vistas y deje espacio para "ajustes y demás configuración".

## Alcance

### Incluido
- Grupo de rutas `(app)` en Next.js agrupando todas las páginas autenticadas bajo un layout común con sidebar. Las URLs no cambian (los grupos de rutas no aparecen en la URL).
- `/login`, `/forgot-password`, `/reset-password` quedan fuera del grupo — sin sidebar, ya que no hay sesión activa ahí.
- Componente `Sidebar.tsx`: nombre de la plataforma arriba, enlaces gateados por permisos (`can_view` → Agenda; `can_manage_platform` → Usuarios y Ajustes), botón de cerrar sesión abajo.
- "Ajustes" agrupa Perfiles de rol, Empresas y Departamentos como sub-enlaces (siempre expandido, sin necesidad de un menú desplegable interactivo).
- La home page pierde su bloque de navegación propio (ya vive en el sidebar) y queda solo con el saludo.

### Fuera de alcance
- Sidebar colapsable/ocultable — se puede agregar después si se necesita.
- Cambios de permisos o RLS — cada página sigue verificando sus propios flags igual que antes; el sidebar solo decide qué mostrar, no reemplaza ninguna verificación de seguridad existente.

## Estructura de archivos

- `src/app/(app)/layout.tsx` (nuevo) — Server Component: obtiene usuario + flags una vez, renderiza `<Sidebar>` + `{children}`.
- `src/app/(app)/Sidebar.tsx` (nuevo) — presentacional, recibe flags/email como props, sin lógica de datos propia.
- Movidos dentro de `(app)/`, sin cambiar su contenido: `page.tsx`, `actions.ts` (logout), `contacts/` completo, `(admin)/` completo (users, role-profiles, companies, departments).
- `src/app/page.tsx` (la que queda en `(app)/page.tsx`) se simplifica: quita el bloque `<nav>` que ya no hace falta.

## Notas de seguimiento

- Si más adelante se necesita colapsar el sidebar en pantallas pequeñas, es un cambio aislado a `Sidebar.tsx`, no a la estructura de rutas.
