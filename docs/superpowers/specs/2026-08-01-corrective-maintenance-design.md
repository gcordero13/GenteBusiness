# Módulo de Mantenimiento Correctivo — Diseño

## Propósito

Extender el módulo de Mantenimiento (ver [2026-07-28-preventive-maintenance-design.md](2026-07-28-preventive-maintenance-design.md)) con un segundo tipo de visita, **Correctivo** (reparación de una falla reportada), además de navegación por año y tipo en la lista de registros. El resto del pipeline — enlace público con token, firmas, PDF, correo, encuesta NPS — se reutiliza sin cambios: solo difieren los campos capturados en el formulario.

## Alcance

Incluye: campo `type` (`preventivo` | `correctivo`) en `maintenance_records`; los 4 campos propios de Correctivo (problema reportado, diagnóstico, solución aplicada, repuestos/piezas usadas); tabs de tipo + selector de año en `/maintenance`; herencia del tipo activo al crear un registro nuevo; rama de tipo en el formulario público, el PDF y los reportes CSV.

No incluye (fuera de alcance / YAGNI): tablas separadas por tipo (ver "Modelo de datos" para el razonamiento); un objeto "Plan de mantenimiento" que agrupe varias visitas por etapas (alternativa considerada y descartada durante el brainstorm a favor de tabs+año, cambio más chico sobre lo ya construido); checklist configurable para Correctivo (los 4 campos son fijos, igual que el checklist de Preventivo); filtros de reporte adicionales a tipo/año (p. ej. por técnico o empresa).

## Modelo de datos

### Cambios a `maintenance_records`

| Columna | Tipo | Notas |
|---|---|---|
| `type` | text, not null, default `'preventivo'` | `check (type in ('preventivo', 'correctivo'))`. Determina qué sección del formulario, PDF y export aplica. |
| `problema_reportado` | text, nullable | Solo Correctivo. |
| `diagnostico` | text, nullable | Solo Correctivo. |
| `solucion_aplicada` | text, nullable | Solo Correctivo. |
| `repuestos_piezas` | text, nullable | Solo Correctivo. |

Todas las columnas existentes (usuario, equipo, checklist de 10 ítems, firmas, status, `pdf_path`, etc.) se quedan sin cambios y se comparten entre ambos tipos. Las columnas de checklist quedan `null` en registros Correctivo; las 4 columnas nuevas quedan `null` en registros Preventivo.

**Por qué extender la misma tabla en vez de tablas por tipo:** el checklist de Preventivo ya vive como columnas planas en `maintenance_records`, no en una tabla aparte — separar solo Correctivo rompería esa simetría, obligaría a tocar RLS/joins/tests ya existentes, y complicaría los exports (JOIN condicional según tipo). Una migración aditiva (`ALTER TABLE ADD COLUMN`) no toca nada existente. Se acepta el costo de una tabla más ancha con columnas nulas según el tipo, consistente con el patrón ya usado para el checklist.

### Migración

Una sola migración nueva (`..._maintenance_records_add_type_and_correctivo_fields.sql`) agrega las 5 columnas de la tabla anterior. No se requiere backfill: los registros existentes son todos Preventivo, y el default `'preventivo'` los cubre.

## Flujos de UI

### Lista `/maintenance`

- Tabs de tipo (**Preventivo** / **Correctivo**) + selector de año, poblado dinámicamente a partir de los años presentes en `created_at` para *cualquiera* de los dos tipos, más el año actual aunque todavía no tenga registros (para poder crear el primer registro de un año/tipo nuevo — p. ej. Correctivo 2026 el día que se lanza esta función). Ambos se reflejan en la URL (`/maintenance?type=correctivo&year=2026`).
- Sin params → tab Preventivo, año actual (2026) — mantiene el comportamiento actual como default.
- El query a Supabase aplica `.eq("type", type)` y un rango de fecha sobre `created_at` según esos params, en vez de traer todo y filtrar en cliente.

### Creación (`NewMaintenanceDialog` / `createMaintenanceRecord`)

- El registro nuevo hereda el `type` de la tab activa en la lista — sin selector adicional en el diálogo. `createMaintenanceRecord(contactId, type)` recibe el tipo como segundo argumento y lo guarda en el insert.

### Formulario público `/mantenimiento/[token]`

- Se mantienen igual: "Información del Usuario" e "Información del Equipo" (host, RAM, SO, almacenamiento) — Correctivo también las captura.
- **Preventivo:** sección "Checklist de Mantenimiento" (10 ítems), como hoy.
- **Correctivo:** en su lugar, 4 campos de texto — Problema reportado, Diagnóstico, Solución aplicada, Repuestos/piezas usadas.
- "Hallazgos" y "Observaciones" se quedan compartidos al final en ambos casos.
- `saveMaintenanceProgress`/`pickAllowedProgressFields` ganan las 4 keys nuevas como campos permitidos; sin cambios de forma.
- Firmas, expiración de enlace, y la regla de completado (ambas firmas presentes → PDF + correos) no cambian — ya son agnósticas al contenido.

## Generación de PDF

`buildMaintenancePdfBytes` gana una rama por `type`: Correctivo renderiza una sección "Diagnóstico y solución" (los 4 campos) en el lugar donde Preventivo renderiza la lista de checklist. El resto del documento (encabezado con logo, datos de usuario/equipo, firmas, fecha) es idéntico. `completeMaintenanceRecord` pasa `type` y los 4 campos correctivos igual que ya pasa el checklist.

## Reportes CSV y encuestas

- `/maintenance/export/basic` y `/maintenance/export/detailed` leen `type` y `year` de los query params (los mismos que la URL de la lista) y aplican los mismos filtros al query de Supabase antes de construir el CSV. Sin filtro en la URL → comportamiento actual (exporta todo), para no romper un enlace guardado o acceso directo antiguo.
- `MaintenanceReportRow` (en `maintenanceReportCsv.ts`) gana un campo `type`; el reporte detallado agrega las 4 columnas de Correctivo junto a las de checklist — ambos grupos de columnas siempre presentes, vacíos cuando no aplican al tipo de esa fila, para que una exportación que mezcle ambos tipos siga siendo una tabla consistente.
- `/maintenance/surveys` y su export: sin cambios de esquema — la encuesta ya es genérica y no distingue tipo de mantenimiento.

## Manejo de errores

Reutiliza el manejo de errores ya definido en el diseño de Preventivo (fallo de PDF no marca completado, fallo de correo guarda `email_error` y expone "Reenviar correo", enlaces inválidos muestran página de estado genérica). No se introduce manejo de errores nuevo: la única superficie nueva (los 4 campos de texto de Correctivo) sigue la misma ruta de guardado que los campos existentes.

## Pruebas

Sigue el precedente de las pruebas ya escritas para Preventivo (`actions.test.ts`, `maintenanceRls.test.ts`): pruebas unitarias para el nuevo branch de PDF por tipo, para el filtrado por `type`/`year` en las rutas de export, y para que `pickAllowedProgressFields` acepte los 4 campos nuevos. El flujo end-to-end del enlace público se prueba manualmente, igual que en Preventivo.
