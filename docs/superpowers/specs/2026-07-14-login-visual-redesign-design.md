# Login Visual Redesign — Diseño

## Contexto

El login actual (`src/app/login/page.tsx`) usa el tema por defecto de shadcn (fondo blanco, tarjeta sin marca). El usuario lo considera "muy simple" y pidió que se vea "mucho más profesional". Se acordó un rediseño con colores de marca (Sanchez Business Corp) aplicado **únicamente** a la página de login, sin tocar el tema global (`globals.css`) ni afectar otras páginas (home, futuras páginas admin).

## Paleta de marca (provista por el usuario)

| Uso | Color |
|---|---|
| Fondo | `#1A1A1A` (variante `#1F1F1F` para la tarjeta, ligeramente más clara que el fondo de página) |
| Texto principal | `#FFFFFF` |
| Acento (botón, focus ring, links activos) | `#04B1AF` |

## Alcance

### Incluido
- Rediseño visual de `src/app/login/page.tsx` únicamente: fondo oscuro de página, tarjeta con fondo `#1F1F1F`, texto blanco, botón "Entrar" en acento teal sólido, inputs con focus ring teal.
- Espacio reservado para un logo (imagen), con texto (nombre de la empresa) como contenido por defecto mientras no haya logo.
- Ajuste del mensaje de error (actualmente `text-red-600`, pensado para fondo blanco) a un tono legible sobre fondo oscuro.
- Colores aplicados vía clases Tailwind arbitrarias (`bg-[#1A1A1A]`, etc.) directamente en el componente de la página — no se tocan `globals.css`, `components.json`, ni los tokens de shadcn.

### Fuera de alcance (explícitamente pospuesto)
- Tema global oscuro para el resto de la app (home, futuras páginas admin) — permanecen con el tema shadcn actual.
- Subida real del logo — se deja el espacio/estructura lista; el usuario decide después cuándo y qué imagen subir a `public/`.
- Cambios a `/forgot-password` o `/reset-password` (quedan con el estilo actual; no se pidió incluirlas en este alcance).

## Diseño de la página

Estructura (reemplaza el JSX actual de `src/app/login/page.tsx`, mismo Server Component, misma lógica de `login` action y manejo de `error` vía `searchParams` — solo cambia el markup/clases):

- Contenedor raíz: ocupa toda la pantalla (`min-h-screen`), fondo `bg-[#1A1A1A]`, centra el contenido vertical y horizontalmente.
- Bloque de marca (arriba de la tarjeta): un `<div>` centrado que por ahora renderiza el nombre de la empresa como texto (`text-white`, tamaño grande, peso semibold). Estructuralmente aislado (su propio `<div>`) para que agregar una imagen ahí después sea un cambio de una sola línea, no un cambio de layout.
- Tarjeta: `bg-[#1F1F1F]`, `rounded-xl`, `shadow-lg` (sombra más pronunciada que el default), padding generoso (`p-8`), `max-w-sm`.
- Título "Iniciar sesión": `text-white`.
- Mensaje de error (si existe): color legible sobre fondo oscuro (ej. `text-red-400` en vez de `text-red-600`).
- Labels: `text-zinc-300` (gris claro, no blanco puro, para jerarquía visual).
- Inputs: fondo ligeramente distinto al de la tarjeta para contraste (ej. `bg-[#1A1A1A]` o `bg-white/5`), borde sutil (`border-white/10`), texto blanco, `focus-visible:ring-[#04B1AF]` en vez del ring gris por defecto del componente `Input` de shadcn.
- Botón "Entrar": fondo sólido `bg-[#04B1AF]`, texto blanco, hover ligeramente más oscuro (ej. `hover:bg-[#039e9c]`).
- Link "¿Olvidaste tu clave?": `text-zinc-400` con `hover:text-white`, mantiene su `href="/forgot-password"` sin cambios.

## Componentes afectados

- `src/app/login/page.tsx` — único archivo modificado. No se tocan `src/app/login/actions.ts`, `src/components/ui/*`, ni `globals.css`.
- Los componentes shadcn (`Button`, `Input`, `Label`) se siguen usando (no se reemplazan por HTML crudo), pasando clases Tailwind adicionales vía la prop `className` para sobreescribir colores puntualmente — consistente con cómo Tailwind + CVA permiten overrides sin tocar el componente base.

## Notas de seguimiento

- El usuario colocará un logo real en `public/` más adelante; en ese momento el bloque de marca cambia de texto a `<Image>` (una sola línea de JSX), sin rediseñar el resto de la página.
- Si más adelante se decide aplicar esta paleta al resto de la app, sería un proyecto separado (tocaría `globals.css`/tokens de shadcn), no una extensión silenciosa de este cambio.
