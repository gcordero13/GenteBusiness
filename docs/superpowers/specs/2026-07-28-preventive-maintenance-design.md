# Módulo de Mantenimiento Preventivo — Diseño

## Propósito

Digitalizar el "Formulario de Mantenimiento Preventivo" en papel: un técnico registra una visita de mantenimiento a un equipo, el usuario y el técnico firman digitalmente, y al completarse se genera un PDF que se envía por correo a `acusesdeti@sanchezbusinesscorp.com`. Adicionalmente, se envía una encuesta de satisfacción (NPS) al usuario sobre el técnico que realizó el trabajo.

## Alcance

Incluye: creación de registros de mantenimiento vinculados a contactos existentes, un formulario público (sin login) accesible por enlace con token para completar datos de equipo/checklist/firmas, generación de PDF, envío de correo con el PDF adjunto, y una encuesta de satisfacción post-mantenimiento con reporte básico de resultados.

No incluye (fuera de alcance / YAGNI): checklist configurable por admin (los 10 ítems son fijos, igual al formulario en papel), registro estructurado de "equipos/activos" como entidad separada (el hostname y specs se guardan como texto libre en el registro), envío automático del enlace inicial por correo (se comparte manualmente), edición del contenido del formulario desde la app una vez generado el enlace (solo se edita vía el enlace público), reintentos automáticos de correo (el reintento es manual vía botón).

## Modelo de datos

### Tabla `maintenance_records`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `token` | text, unique, indexado | Aleatorio (~32 bytes, url-safe base64). Es la credencial de acceso al enlace público. |
| `contact_id` | uuid, FK → `contacts` | Contacto seleccionado al crear el registro. |
| `created_by` | uuid, FK → `app_users` | Técnico que generó el registro. |
| `first_name`, `last_name`, `position`, `company_name`, `department_name`, `email` | text | **Snapshot** copiado de `contacts`/`companies`/`departments` al momento de creación — el reporte firmado refleja el estado del contacto el día de la visita, no su estado actual. |
| `host_name` | text | Nombre del host/equipo. |
| `ram`, `os`, `storage_total`, `storage_used`, `storage_free` | text | Texto libre, capturado por el técnico en el formulario del enlace. |
| `restore_point_created`, `temp_files_cleaned`, `disk_defragmented`, `antivirus_updated`, `windows_updated`, `agenda_installed`, `apps_match_profile`, `wallpaper_installed`, `keyboard_cleaned`, `screen_cleaned` | boolean, nullable | Los 10 ítems del checklist original. Nullable hasta que se responden. |
| `findings` | text, nullable | Hallazgos. |
| `observations` | text, nullable | Observaciones. |
| `technician_signature_url` | text, nullable | PNG en bucket `maintenance-signatures`. |
| `technician_signed_at` | timestamptz, nullable | |
| `user_signature_url` | text, nullable | PNG en bucket `maintenance-signatures`. |
| `user_signed_at` | timestamptz, nullable | |
| `status` | text | `pendiente` \| `completado` \| `expirado` |
| `pdf_url` | text, nullable | PDF final en bucket privado `maintenance-reports`. |
| `email_error` | text, nullable | Mensaje de error si el envío de correo falló tras completarse; habilita el botón "Reenviar correo". |
| `expires_at` | timestamptz | `created_at + 30 días`. Pasada esta fecha sin completar, el enlace deja de aceptar cambios (estado `expirado`). |
| `completed_at` | timestamptz, nullable | |
| `created_at` | timestamptz | |

Reglas de completado: el registro pasa a `completado` automáticamente cuando ambas firmas (`technician_signature_url` y `user_signature_url`) están presentes. En ese momento se dispara la generación del PDF y el envío de los dos correos (PDF y encuesta).

### Tabla `maintenance_surveys`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `maintenance_record_id` | uuid, FK → `maintenance_records`, unique | Relación uno-a-uno. |
| `technician_id` | uuid, FK → `app_users` | Copiado de `maintenance_records.created_by` al crearse la encuesta. |
| `token` | text, unique, indexado | Token propio, distinto al del formulario de mantenimiento (ese ya está bloqueado cuando se envía la encuesta). |
| `nps_score` | smallint, nullable | 0–10. "¿Qué tan probable es que recomiende nuestro servicio técnico a un colega?" |
| `quality_score` | smallint, nullable | 1–5. "¿Cómo calificaría la calidad del trabajo realizado?" |
| `punctuality_score` | smallint, nullable | 1–5. "¿Cómo calificaría la puntualidad del técnico?" |
| `professionalism_score` | smallint, nullable | 1–5. "¿Cómo calificaría la amabilidad y profesionalismo del técnico?" |
| `clarity_score` | smallint, nullable | 1–5. "¿Qué tan clara fue la explicación del trabajo realizado?" |
| `comments` | text, nullable | Comentario opcional. |
| `status` | text | `pendiente` \| `respondida` |
| `responded_at` | timestamptz, nullable | |
| `expires_at` | timestamptz | `created_at + 30 días`. |
| `created_at` | timestamptz | |

Un registro de encuesta se crea automáticamente junto con el correo de encuesta, en el mismo momento en que `maintenance_records` pasa a `completado`.

## Módulo de permisos

Nuevo módulo `maintenance` en el sistema existente de `role_profiles` / `get_my_module_permissions`. Usa las columnas estándar ya existentes en el esquema de permisos: `can_view`, `can_add`, `can_delete` (ver lista de registros, crear nuevos, cancelar/eliminar pendientes). Las columnas `can_edit`/`can_deactivate`/`can_manage`/`can_authorize` no se usan para este módulo — el contenido del formulario solo se edita vía el enlace público, nunca desde la app.

## Seguridad de acceso

- **Lado técnico (autenticado):** RLS estándar sobre `maintenance_records`/`maintenance_surveys` gateada por `get_my_module_permissions('maintenance')`, igual que Contactos/Empresas/Departamentos.
- **Lado enlace público (`/mantenimiento/[token]`, `/encuesta/[token]`):** sin sesión de Supabase Auth. Toda lectura/escritura pasa por Server Actions que usan el cliente admin (service role) y validan el `token` contra la base de datos antes de cualquier operación — no hay política RLS anónima directa sobre estas tablas. El token largo y aleatorio es la única credencial. Tokens expirados, inexistentes, o de registros ya completados devuelven una página de estado genérica sin distinguir la causa exacta.
- **Firmas:** bucket privado `maintenance-signatures`. La subida ocurre exclusivamente vía Server Action (nunca upload directo desde el cliente al bucket), ya que quien firma no tiene `auth.uid()` para una política RLS convencional — la validación de token en el servidor autoriza la escritura.
- **PDF final:** bucket privado `maintenance-reports`, escrito solo por el servidor tras completarse el registro.

## Flujos de UI

### Lado técnico (autenticado, dentro de la app)

- Nueva entrada "Mantenimientos" en el sidebar (visible según `can_view` del módulo `maintenance`).
- **Lista:** tabla con Usuario, Empresa, Técnico, Estado, Fecha de creación, Fecha de completado. Filtros por estado/empresa/técnico.
- **Nuevo mantenimiento:** buscador de contactos (autocompletar por nombre/correo, igual que en Agenda). Al seleccionar uno, se crea el registro (snapshot de datos) y se muestra el enlace generado con botón "Copiar enlace".
- **Detalle de un registro:** todos los datos en solo lectura (equipo, checklist, hallazgos, observaciones, firmas si existen). Si está pendiente: botón "Copiar enlace". Si está completado: botón "Descargar PDF", y si `email_error` está presente, botón "Reenviar correo". `can_delete` permite cancelar/eliminar un registro pendiente.
- **Pestaña "Encuestas":** tabla de respuestas individuales (vinculadas a su registro de mantenimiento) + promedio de NPS por técnico, filtrable por técnico.

### Lado enlace público `/mantenimiento/[token]` (sin login)

- Token inválido/expirado/registro ya completado → página de estado genérica.
- Token vigente → formulario con: datos de usuario (solo lectura, autocompletados desde el snapshot), datos de equipo (editable), checklist de 10 ítems (Sí/No), hallazgos y observaciones (texto libre). Botón "Guardar progreso" (Server Action con validación de token).
- Dos áreas de firma en canvas ("Firma del Técnico" / "Firma del Usuario"), capturables independientemente en momentos distintos (útil para el caso remoto) o seguidas (caso en persona).
- Al quedar ambas firmas presentes: se bloquea el registro, se genera el PDF, se envían los dos correos, y la página pasa a solo lectura confirmando "Mantenimiento completado". Si la generación del PDF falla, el registro no se marca completado y se permite reintentar sin perder los datos guardados.

### Lado enlace público `/encuesta/[token]` (sin login)

- Página de 5 preguntas (NPS + 4 de satisfacción) + comentario opcional. Un solo envío; tras responder, pasa a solo lectura con mensaje de agradecimiento.

## Generación de PDF

Nuevo módulo `src/lib/maintenancePdfReport.ts`: construye el documento con `pdf-lib` desde cero (texto, tablas, casillas ☑/☐, firmas incrustadas como imágenes), replicando el layout del formulario en papel (datos de usuario, datos de equipo, checklist, hallazgos, observaciones, firmas, fecha). Se ejecuta en el servidor cuando ambas firmas quedan presentes. El resultado se sube a `maintenance-reports` y su URL se guarda en `pdf_url`.

## Envío de correo

Server Action que usa `nodemailer` con las credenciales SMTP ya configuradas en Ajustes (mismas que usa `saveSmtpSettings`/`updateAuthConfig`), sin provisionar un servicio nuevo. Al completarse el registro, envía en el mismo momento:

1. PDF adjunto a `acusesdeti@sanchezbusinesscorp.com`, asunto `Mantenimiento - {nombre del usuario} - {fecha}`.
2. Enlace de la encuesta (`/encuesta/[token]`) al correo del usuario.

## Manejo de errores

- Falla la generación del PDF → el registro no se marca `completado`; la página del enlace muestra error y permite reintentar sin perder datos.
- El PDF se genera pero falla el envío de correo → el registro sí se completa/bloquea (las firmas ya son válidas); se guarda `email_error` y aparece "Reenviar correo" en la vista de detalle del técnico.
- Enlaces inválidos/expirados/completados → página de estado genérica, sin revelar cuál fue la causa específica.
- Guardado de progreso antes de firmar → sobrescritura simple vía Server Action; no se implementa bloqueo optimista (herramienta interna de baja concurrencia).

## Pruebas

Siguiendo el precedente de `pdfStamping.test.ts`: pruebas unitarias para la lógica pura — generación/validación de tokens, layout del PDF (posiciones de texto/casillas), validaciones del checklist y de la encuesta. El flujo end-to-end completo (enlace público → firmas → PDF → correo real) se prueba manualmente, ya que depende de Storage y SMTP reales.
