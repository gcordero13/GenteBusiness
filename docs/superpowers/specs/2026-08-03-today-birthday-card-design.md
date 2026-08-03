# Tarjeta "Hoy cumple años" + Modal de contacto — Diseño

## Propósito

Hoy el home solo muestra un carrusel de "Próximos cumpleaños" (`BirthdaysWidget`/`BirthdaysCoverflow`), donde la persona que cumple años hoy se distingue apenas con una insignia pequeña "¡Hoy!" dentro del mismo carrusel. Se quiere una celebración más visible: una tarjeta propia, separada, animada con confeti, exclusiva para quien cumple años **hoy**. Además, hacer clic en cualquier foto de cumpleaños (en esta tarjeta nueva o en el carrusel de próximos) debe abrir un modal de solo lectura con los datos del contacto, en vez de navegar a su ficha editable.

## Alcance

Incluye: una tarjeta nueva ("Hoy cumple años") que aparece arriba del carrusel existente solo cuando al menos un contacto activo cumple años hoy, con animación de confeti continua y foto grande; si más de una persona cumple el mismo día, un carrusel dentro de esta misma tarjeta; un modal compartido (sin botón de editar) con los datos de contacto al hacer clic en cualquier foto de cumpleaños, tanto en la tarjeta nueva como en el carrusel de "Próximos cumpleaños" existente; ampliar la consulta del home para traer los campos adicionales que el modal necesita.

No incluye (fuera de alcance / YAGNI, piezas independientes a diseñar después): el cuadro de solicitudes pendientes, el cuadro de días feriados, cualquier librería de confeti de terceros (se usa CSS/divs generados, igual que el carrusel existente), notificaciones o correos por cumpleaños.

## Modelo de datos

Sin cambios de esquema — todos los campos ya existen en `contacts`. Solo se amplía la consulta en `src/app/(app)/page.tsx`, que hoy trae `id, first_name, last_name, birth_date, photo_url`, para incluir también: `position, email, extension, fleet_phone, companies(name), departments(name)`.

`BirthdayContact` (en `src/lib/contacts.ts`) se extiende con estos campos opcionales, ya que tanto la tarjeta de hoy como el modal los necesitan; el carrusel de próximos cumpleaños los recibe también (para poder abrir el mismo modal) aunque no los muestre directamente en su propia UI.

## Separación de "hoy" vs. "próximos"

`src/app/(app)/page.tsx` separa la lista de contactos con cumpleaños en dos grupos antes de pasarlos a los widgets:

- **Hoy:** contactos activos donde `isTodayBirthday(birth_date)` es verdadero (función ya existente en `src/lib/contacts.ts`).
- **Próximos:** el resultado de `getUpcomingBirthdays(...)` (función ya existente) **excluyendo** a quienes ya están en el grupo de "hoy" — para no mostrar a la misma persona en ambos cuadros.

## Componentes

### `TodayBirthdayCard.tsx` (nuevo)

Client component. Recibe `contacts: BirthdayContact[]` (solo quienes cumplen hoy). Si el arreglo está vacío, no renderiza nada (`return null`).

- Tarjeta con fondo en degradado verde/teal (`linear-gradient(135deg, #04B1AF, #10b981)`), esquinas redondeadas, confeti cayendo continuamente (piezas `<div>` generadas en un `useEffect`/`useMemo` con posición, color y duración de animación aleatorias — igual mecánica que el mockup aprobado, sin librería nueva).
- Foto del contacto activo a 160px (más grande que el carrusel de próximos), nombre en negro, cargo debajo en gris oscuro, insignia "🎉 ¡Hoy cumple años!" en texto blanco sobre un pill translúcido blanco.
- Si `contacts.length > 1`: la tarjeta es en sí misma un mini-carrusel (mismo mecanismo de `active`/autoplay que `BirthdaysCoverflow`, pero solo con una persona visible a la vez dentro de esta tarjeta — no la vista 3D en perspectiva del carrusel de próximos, ya que aquí el foco es una sola persona a la vez, con puntos de navegación debajo si hay más de una).
- Al hacer clic en la foto (o en el nombre): abre `BirthdayContactModal` para esa persona, en vez de navegar.

### `BirthdayContactModal.tsx` (nuevo, compartido)

Client component. Recibe un `contact: BirthdayContact` (con los campos ampliados) y `children` (el trigger, mismo patrón que `ContactViewDialog` — `DialogTrigger render={<button>{children}</button>}`).

Contenido: avatar + nombre + posición + empresa/departamento en el encabezado (igual que `ContactViewDialog`), luego una grilla con: Cumpleaños (`formatMonthDay`), Correo, Extensión, Teléfono/Flota (con enlace de WhatsApp si `has_whatsapp`, igual que `ContactViewDialog`). **Sin badge de estado activo/anulado y sin botón "Editar"** — a diferencia de `ContactViewDialog`, este modal es de solo lectura para cualquier usuario que vea el home, no una herramienta de administración de contactos.

No reutiliza `ContactViewDialog` directamente (ese componente exige `canEdit`/muestra el badge de estado y no incluye cumpleaños) — es un componente nuevo y más simple, pero visualmente consistente (mismos tokens de color, mismo patrón de `Dialog`).

Igual que `ContactViewDialog`, cada campo de la grilla (correo, extensión, teléfono/flota) solo se renderiza si el contacto tiene ese dato; el cumpleaños siempre se muestra ya que es la razón de ser del modal en este contexto (los contactos que llegan aquí siempre tienen `birth_date`, por venir de la lista de cumpleaños).

### `BirthdaysCoverflow.tsx` (modificado)

Cada `<Link href={`/contacts/${c.id}`}>` se reemplaza por un trigger de `BirthdayContactModal` envolviendo el mismo contenido (avatar + nombre), quitando la navegación a la ficha del contacto. El resto del carrusel (posiciones 3D, autoplay, puntos de navegación) no cambia.

### `BirthdaysWidget.tsx` (modificado)

Renderiza `TodayBirthdayCard` (si aplica) arriba de `BirthdaysCoverflow`, dentro del mismo contenedor con degradado que ya tiene.

## Manejo de errores

No aplica — no hay escritura de datos ni llamadas de red nuevas; todo el contenido ya viene resuelto en el render del servidor (`page.tsx`), igual que hoy.

## Pruebas

Sigue el precedente del resto de este módulo (carrusel y widgets de cumpleaños no tienen pruebas unitarias hoy, son componentes visuales verificados manualmente): se agregan pruebas unitarias solo para la lógica pura nueva en `src/lib/contacts.ts` (separar "hoy" de "próximos", asegurando que no haya duplicados entre los dos grupos). `TodayBirthdayCard`/`BirthdayContactModal`/`BirthdaysCoverflow` se verifican manualmente en el navegador.
