# Módulo Aprendizaje — Diseño

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Objetivo:** un módulo interno de formación para todos los empleados. Incluye
cursos y tutoriales con videos, guías y evaluaciones; contenido de Historia; y
gamificación con insignias y certificados descargables.

**Arquitectura:** un solo motor de cursos con dos categorías, `curso` y
`historia`. Un contenido de Historia es un curso cuyas lecciones son lecturas
con imágenes o videos. Comparte avance, evaluaciones, insignias y
certificados. El módulo `aprendizaje` se registra en `modules` /
`role_profile_permissions`, como los demás. Toda escritura que deba ser
confiable (avance, completitud, intentos, notas, insignias) pasa por funciones
`security definer` en Postgres, nunca por escrituras directas del cliente.

**Decisiones confirmadas con el usuario (2026-11-25):**
- El contenido lo crea un área desde la plataforma (permiso **Gestionar**).
- Los videos pueden ser **enlaces** (YouTube, Vimeo, Stream) o **subidos a
  SharePoint** con la integración existente.
- Las evaluaciones usan un **banco de preguntas al azar**: a cada persona le
  tocan N preguntas distintas, en distinto orden y con opciones mezcladas.
- Acceso **catálogo + asignados**: todos ven el catálogo y el área asigna
  cursos obligatorios a departamentos o personas.
- Construcción **por fases**: 1 Cursos → 2 Asignaciones → 3 Evaluaciones →
  4 Gamificación. Cada fase es usable por sí sola y se despliega por separado.

---

## Permisos (módulo `aprendizaje`)

| Flag | Significado |
|---|---|
| `can_view` | Ver el catálogo, tomar cursos y ver sus propios logros. |
| `can_manage` | Crear y editar cursos, lecciones y bancos de preguntas; asignar; ver reportes de todos. |

- **Grants iniciales:** `can_view = true` para **todos** los perfiles de rol,
  porque es formación para toda la empresa (aprobado por el usuario).
  `can_manage = true` solo para `Super Admin`. Ambos quedan como filas
  explícitas en Perfiles de rol y se pueden quitar o dar por perfil. No hay
  nada abierto "a cualquier autenticado" sin pasar por el permiso.
- **Menú lateral:** "Aprendizaje" (ícono `GraduationCap`) se muestra con
  `can_view` o `can_manage`. "Gestión" dentro del módulo solo se muestra con
  `can_manage`.

## Identidad de empleados y departamentos

`app_users.id` es el usuario. El departamento sale de `contacts.department_id`,
enlazando `contacts.email = app_users.email`, el mismo patrón que GoServices.
Una asignación a un departamento incluye a todo `app_user` cuyo contacto
pertenece a ese departamento en el momento de consultar (dinámico: un ingreso
nuevo al departamento hereda la asignación).

---

## Modelo de datos

Todas las tablas usan el prefijo `aprendizaje_` y tienen RLS habilitado.

### Fase 1 — Cursos

```
aprendizaje_cursos
  id uuid pk, title text not null, description text,
  category text not null check (category in ('curso','historia')),
  status text not null default 'borrador' check (status in ('borrador','publicado','archivado')),
  cover_drive_id text, cover_item_id text,            -- portada opcional (SharePoint)
  created_by uuid references app_users, created_at, updated_at

aprendizaje_lecciones
  id uuid pk, curso_id uuid not null references aprendizaje_cursos on delete cascade,
  position int not null, title text not null,
  body text,                                          -- texto plano con saltos de línea
  video_url text,                                     -- enlace externo
  video_drive_id text, video_item_id text,            -- o video en SharePoint
  created_at, updated_at
  unique (curso_id, position) deferrable initially deferred

aprendizaje_leccion_archivos                         -- guías, PDFs, imágenes
  id uuid pk, leccion_id uuid not null references aprendizaje_lecciones on delete cascade,
  filename text not null, content_type text not null, size_bytes bigint,
  drive_id text not null, item_id text not null, position int not null, created_at

aprendizaje_inscripciones                            -- un registro por (curso, usuario)
  curso_id uuid references aprendizaje_cursos on delete cascade,
  app_user_id uuid references app_users on delete cascade,
  started_at timestamptz not null default now(), completed_at timestamptz,
  primary key (curso_id, app_user_id)

aprendizaje_progreso_lecciones
  leccion_id uuid references aprendizaje_lecciones on delete cascade,
  app_user_id uuid references app_users on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (leccion_id, app_user_id)
```

Una lección puede tener video, texto y archivos a la vez, cualquiera de
ellos opcional. Un video es **o** un enlace **o** un archivo de SharePoint,
nunca ambos (check constraint).

### Fase 2 — Asignaciones

```
aprendizaje_asignaciones
  id uuid pk, curso_id uuid not null references aprendizaje_cursos on delete cascade,
  department_id uuid references departments,          -- exactamente uno de los dos
  app_user_id uuid references app_users,
  due_date date, assigned_by uuid references app_users, created_at
  check ((department_id is null) <> (app_user_id is null))
```

### Fase 3 — Evaluaciones

```
-- columnas nuevas en aprendizaje_cursos
  eval_questions_per_attempt int,                     -- null = sin evaluación
  eval_passing_score int not null default 70 check (between 1 and 100),
  eval_max_attempts int                               -- null = ilimitados

aprendizaje_preguntas
  id uuid pk, curso_id uuid not null references aprendizaje_cursos on delete cascade,
  text text not null, type text not null check (type in ('opcion_unica','verdadero_falso')),
  active boolean not null default true, created_at

aprendizaje_opciones
  id uuid pk, pregunta_id uuid not null references aprendizaje_preguntas on delete cascade,
  text text not null, is_correct boolean not null default false, position int not null

aprendizaje_intentos
  id uuid pk, curso_id uuid not null references aprendizaje_cursos on delete cascade,
  app_user_id uuid not null references app_users on delete cascade,
  started_at timestamptz not null default now(), submitted_at timestamptz,
  questions jsonb not null,  -- [{pregunta_id, option_ids:[...]}] en el orden mostrado
  answers jsonb,             -- {pregunta_id: option_id}
  score int, passed boolean
```

### Fase 4 — Gamificación

```
aprendizaje_insignias                                -- catálogo, sembrado por migración
  code text pk, name text not null, description text not null, icon text not null

aprendizaje_insignias_usuario
  app_user_id uuid references app_users on delete cascade,
  insignia_code text references aprendizaje_insignias,
  awarded_at timestamptz not null default now(),
  primary key (app_user_id, insignia_code)
```

Insignias iniciales: `primer_curso` (primer curso completado), `cinco_cursos`,
`diez_cursos`, `nota_perfecta` (100% en una evaluación), `historiador`
(3 contenidos de Historia completados), `al_dia` (todos los cursos
asignados completados antes de su fecha límite).

---

## Reglas de negocio

- **Inicio de curso:** se crea la inscripción la primera vez que la persona
  marca una lección como vista o inicia la evaluación.
- **Marcar lección vista:** botón explícito. Los videos incrustados no
  permiten detectar de forma confiable que se vieron completos.
- **Curso completado:** todas sus lecciones vistas y, si el curso tiene
  evaluación, al menos un intento aprobado. Se evalúa y fija
  `completed_at` dentro de las funciones definer. Si después se agregan
  lecciones a un curso ya completado, la completitud **no** se revoca.
- **Evaluación:** solo se puede iniciar con todas las lecciones vistas. Al
  iniciar, el servidor sortea `min(N, preguntas activas)` preguntas, mezcla
  sus opciones y guarda ese orden en el intento. La nota es
  `correctas / total * 100`, redondeada hacia abajo; aprueba si
  `nota >= eval_passing_score`. Si hay `eval_max_attempts`, al agotarlos sin
  aprobar no se pueden iniciar más. El gestor puede reiniciar intentos de una
  persona. Un intento sin enviar se retoma con el mismo sorteo, no se vuelve a
  sortear.
- **Seguridad de respuestas:** quien toma el curso **nunca** recibe
  `is_correct`. Las preguntas del intento se leen con una función definer que
  devuelve texto y opciones sin la respuesta, y la corrección ocurre en el
  servidor.
- **Cursos en borrador o archivados:** solo los ve `can_manage`. Archivar un
  curso lo saca del catálogo pero conserva el avance y los certificados.
- **Certificado:** PDF de participación generado al vuelo con `pdf-lib`, como
  la constancia de vacaciones. Incluye nombre, curso, fecha de completitud y
  un código de verificación (id de la inscripción). Solo lo descarga su dueño
  o un gestor.

## Funciones Postgres (`security definer`, `search_path = public`)

| Función | Fase | Qué hace |
|---|---|---|
| `aprendizaje_marcar_leccion(leccion_id)` | 1 | Valida que el curso esté publicado y que el usuario tenga `can_view`. Inserta progreso e inscripción y recalcula completitud. |
| `aprendizaje_recalcular_completitud(curso_id, app_user_id)` | 1 | Interna: fija `completed_at` si se cumplen las reglas. En la fase 4 también otorga insignias. |
| `aprendizaje_iniciar_intento(curso_id)` | 3 | Valida lecciones vistas e intentos disponibles; sortea y crea el intento, o devuelve el abierto. |
| `aprendizaje_preguntas_intento(intento_id)` | 3 | Devuelve las preguntas y opciones del intento **sin** `is_correct`, solo al dueño. |
| `aprendizaje_enviar_intento(intento_id, answers jsonb)` | 3 | Corrige, guarda nota y aprobado, y recalcula completitud. |
| `aprendizaje_mis_asignaciones()` | 2 | Cursos asignados al usuario (directo o por departamento), con fecha límite y estado. |
| `aprendizaje_reporte_curso(curso_id)` | 2 | Solo `can_manage`: cada persona asignada con estado completado, pendiente o vencido. |

## RLS (resumen)

- `aprendizaje_cursos`, `lecciones` y `leccion_archivos`: **select** si
  `can_manage`, o si `can_view` y el curso está `publicado`. **insert,
  update y delete** solo con `can_manage`.
- `aprendizaje_inscripciones`, `progreso_lecciones`, `intentos` e
  `insignias_usuario`: **select** de lo propio, o todo con `can_manage`. **Sin
  insert ni update directos**: se escriben solo vía funciones definer. Delete
  de intentos solo con `can_manage` (reiniciar intentos).
- `aprendizaje_preguntas` y `opciones`: **select, insert, update y delete**
  solo con `can_manage`. Quien toma el curso no tiene ningún acceso directo.
- `aprendizaje_asignaciones`: **select** con `can_manage`, o filas que aplican
  al usuario (directas o de su departamento). **Escrituras** solo con
  `can_manage`.
- `aprendizaje_insignias`: **select** con `can_view` o `can_manage`.

## Archivos en SharePoint

- **Subida:** todos los archivos del módulo (videos, guías, imágenes,
  portadas) usan una **sesión de subida reanudable** de Graph. Una server
  action, solo para `can_manage`, crea la sesión en
  `aprendizaje/{uuid}-{filename}` y devuelve la `uploadUrl`. El navegador
  sube por partes de 5 MiB (múltiplo de 320 KiB) directo a esa URL, sin pasar
  por Vercel, que limita los cuerpos a ~4.5 MB. La última respuesta trae el
  `driveItem` (`id`, `parentReference.driveId`), que se guarda con otra server
  action.
- **Reproducción y descarga:** la ruta `/api/aprendizaje/archivo/[driveId]/[itemId]`
  verifica permiso y redirige a la URL temporal de descarga de Graph (patrón
  de `api/goservices/attachment`). El `<video>` usa esa ruta como `src`, y la
  URL de Graph acepta `Range`, así que se puede adelantar el video.
- **Riesgo a validar al inicio de la Fase 1:** que la `uploadUrl` acepte
  `PUT` desde el navegador (CORS). Si no lo acepta, la alternativa es una
  ruta de API que reenvíe cada parte de ≤4 MB.
- **Límites:** video ≤ 2 GB; guías e imágenes ≤ 100 MB. Tipos de video:
  `video/mp4`, `video/webm`, `video/quicktime`.

## Enlaces de video

Un helper `toVideoEmbed(url)` convierte enlaces de YouTube (`watch?v=`,
`youtu.be/`, `shorts/`) y Vimeo a URL de `iframe` embebible. Cualquier otro
enlace (Stream, SharePoint, etc.) se muestra como botón "Abrir video" en una
pestaña nueva.

## Pantallas

| Ruta | Quién | Contenido |
|---|---|---|
| `/aprendizaje` | `can_view` | Pestañas **Cursos** e **Historia**, con tarjetas que muestran portada, título, número de lecciones y avance propio. Arriba, **Mis cursos asignados** con fecha límite (fase 2). Enlace a **Mis logros** (fase 4). |
| `/aprendizaje/[cursoId]` | `can_view` | Lista de lecciones con su estado, la lección actual (video, texto y archivos) y "Marcar como vista". Barra de avance. Botón de evaluación (fase 3) y de certificado (fase 4). |
| `/aprendizaje/[cursoId]/evaluacion` | `can_view` | Toma del intento: preguntas sorteadas, envío y resultado (fase 3). |
| `/aprendizaje/logros` | `can_view` | Insignias obtenidas y por obtener, y certificados descargables (fase 4). |
| `/aprendizaje/gestion` | `can_manage` | Lista de cursos con estado; crear curso. |
| `/aprendizaje/gestion/[cursoId]` | `can_manage` | Editar datos del curso, lecciones (ordenar, subir video o archivos) y publicar o archivar. Pestañas **Preguntas** (fase 3) y **Asignaciones y reporte** (fase 2). |

## Fuera de alcance (por ahora)

- Notificaciones por correo o push al asignar un curso; se pueden agregar
  después con la infraestructura existente.
- Foros o comentarios en lecciones.
- Detección automática de video visto completo.
- Editor de texto enriquecido; el cuerpo de la lección es texto plano.
- Preguntas abiertas o con varias respuestas correctas a la vez. Los tipos son
  **selección múltiple** (`opcion_unica`: varias opciones, una sola correcta) y
  **verdadero o falso**.

## Pruebas

- **Unitarias (Vitest):** `toVideoEmbed`, la lógica de partes de subida, el
  cálculo de nota y las reglas de completitud que vivan en TypeScript.
- **Integración RLS** (`src/test/integration/`, patrón existente contra
  Supabase):
  - un empleado no ve cursos en borrador;
  - no puede insertar progreso ni inscripciones directamente;
  - nunca puede leer `aprendizaje_opciones.is_correct`;
  - solo ve sus propios intentos.
- **Componentes (Testing Library):** marcar una lección, el flujo de una
  evaluación y el editor de lecciones.

## Despliegue

Cada fase trae sus migraciones en `supabase/migrations/`. El usuario las
aplica pegándolas, en orden, en el **SQL Editor** de Supabase. No se usa
`supabase db push`: la CLI no está configurada en este proyecto y además
aplicaría otras migraciones pendientes a propósito (la limpieza destructiva
de Horarios). Las migraciones de Aprendizaje son solo aditivas: sin ellas el
menú no aparece y las páginas redirigen, porque nadie tiene todavía el
permiso. Los tests de integración requieren las migraciones ya aplicadas.
