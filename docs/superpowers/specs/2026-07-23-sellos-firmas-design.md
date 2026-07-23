# Módulo "Sellos y Firmas" — Diseño

## Contexto

El usuario tiene una app de escritorio existente en Electron (`C:\Sellos\sello-app`) que permite abrir un PDF, colocar sellos de empresa (imágenes PNG), firmas dibujadas y texto libre sobre las páginas, y guardar el resultado. Esta lógica —probada y funcional— se traslada a un nuevo módulo dentro de GenteBusiness, reutilizando las mismas librerías (`pdfjs-dist` para visualizar, `pdf-lib` para "grabar" los elementos en el PDF final), ya que ambas funcionan igual de bien en el navegador que en Electron.

Referencia de la lógica original: `C:\Sellos\sello-app\renderer\app.js` (manejo de PDF, arrastrar/redimensionar elementos, dibujo de firma, guardado con pdf-lib) y `main.js` (almacenamiento de sellos/firmas en disco — reemplazado aquí por Supabase Storage).

## Alcance

### Incluido
- Nuevo módulo de plataforma: **Sellos y Firmas**, integrado al sistema de permisos por módulo ya existente (`modules` / `role_profile_permissions`)
- Cargar un PDF desde el dispositivo del usuario (no se sube a ningún servidor)
- Ver el PDF renderizado página por página en el navegador
- Colocar sobre las páginas: sellos de empresa (imagen), firmas dibujadas (imagen), texto libre (con fuente, tamaño, color, negrita, cursiva, subrayado)
- Arrastrar, redimensionar y eliminar cada elemento colocado, antes de descargar
- Descargar el PDF final con todos los elementos "grabados" (incrustados como imágenes en las páginas correspondientes)
- Gestión de sellos de empresa: subir un PNG nuevo asociado a una empresa existente (tabla `companies`), ver todos los sellos disponibles (de cualquier empresa) en una sola galería con el nombre de la empresa junto a cada uno, eliminar sellos
- Gestión de firmas personales: dibujar una firma en un lienzo (mouse/touch), guardarla para reutilizarla, ver la lista de firmas guardadas propias, eliminarlas

### Fuera de alcance (explícitamente descartado)
- Guardar/historiar los PDFs ya sellados en la plataforma — el documento final solo se descarga, no queda ninguna copia ni registro en Supabase
- Firma electrónica con validez legal/criptográfica — esto es una marca visual (imagen) sobre el documento, igual que la app de Electron; no es una firma digital certificada
- Compartir firmas entre usuarios — cada firma guardada es privada de quien la dibujó

## Arquitectura técnica

Todo el procesamiento del PDF ocurre **en el navegador del cliente**, sin pasar por el backend:

- **`pdfjs-dist`**: carga el PDF (`File` local, vía `<input type="file">` o arrastrar-y-soltar) y renderiza cada página en un `<canvas>` para visualización, igual que en la app de Electron (`pdfjsLib.getDocument`, `page.getViewport`, `page.render`)
- Cada elemento colocado (sello, firma o texto) se representa internamente como una imagen PNG (data URL) posicionada y dimensionada sobre una capa (`div` overlay) encima del canvas — el texto se renderiza primero a un `<canvas>` oculto con las propiedades elegidas (fuente/color/negrita/etc.) y se convierte a PNG, exactamente como `renderTextToDataUrl` en la app original
- Arrastrar/redimensionar/eliminar se maneja con listeners de mouse/touch sobre los elementos de la capa overlay, reutilizando el mismo modelo de datos por página (`{ id, type, dataUrl, x, y, w, h }`) que ya funciona en la app de Electron
- **`pdf-lib`** (`PDFDocument.load` + `embedPng` + `drawImage`): al descargar, se carga el PDF original desde los bytes en memoria, se incrusta cada elemento como imagen en la página correspondiente (con la misma conversión de coordenadas usada en la app original — el eje Y del PDF crece hacia arriba desde la esquina inferior izquierda, al revés que el overlay del navegador), y se genera el archivo final como un Blob para descarga directa (`URL.createObjectURL` + `<a download>`), sin tocar el servidor
- Los sellos de empresa y las firmas guardadas del usuario **sí** se obtienen de Supabase (Storage + tablas), convertidos a data URL en el cliente, para ofrecerlos como opciones reutilizables en la galería de sellos y en la lista de firmas guardadas

## Modelo de datos

### `modules` (tabla ya existente — se agrega una fila)
Nueva fila: `key = 'document_stamps'`, `label = 'Sellos y Firmas'`.

### `role_profile_permissions` (tabla ya existente — se agregan filas)
Al insertar el nuevo módulo, se crea una fila de permisos por cada perfil de rol existente (mismo patrón usado al agregar el módulo `settings`). Solo se usa el flag **`can_add`**: controla de forma unificada subir sellos nuevos, usar sellos/firmas existentes, y sellar/descargar documentos. Un perfil sin `can_add` en este módulo no ve la sección en absoluto (no hay una distinción separada de "solo ver").

### `company_seals` (tabla nueva)
| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| company_id | uuid fk → companies.id | |
| name | text | nombre visible del sello (ej. "Sello oficial") |
| storage_path | text | ruta del PNG en el bucket `company-seals` |
| created_at | timestamptz | default now() |

RLS: `select`/`insert`/`delete` requieren `can_add` en el módulo `document_stamps` (vía `get_my_module_permissions('document_stamps')`, mismo patrón que el resto de la plataforma).

### `user_signatures` (tabla nueva)
| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → app_users.id | dueño de la firma |
| storage_path | text | ruta del PNG en el bucket `user-signatures` |
| created_at | timestamptz | default now() |

RLS: `select`/`insert`/`delete` solo donde `user_id = auth.uid()` — **no depende del permiso del módulo**, es estrictamente por dueño (una firma representa a una persona, no a la empresa).

### Storage
- Bucket `company-seals`: lectura/escritura gobernadas por `can_add` en `document_stamps` (política igual a las ya usadas para `contact-photos`)
- Bucket `user-signatures`: cada archivo bajo una ruta con el id del usuario (ej. `{user_id}/firma_<timestamp>.png`); políticas de Storage restringen lectura/escritura/borrado a rutas que empiecen con el propio `auth.uid()`

## Flujo de uso (UI)

1. Página `/document-stamps` (o similar): zona para arrastrar un PDF o abrir el selector de archivos. Al cargar, se muestra el visor con controles de página (anterior/siguiente), zoom, y una barra de herramientas: **Sello**, **Texto**, **Firma**, **Eliminar elemento seleccionado**, **Descargar**.
2. **Sello**: abre una galería con todos los sellos disponibles (de cualquier empresa, con el nombre de la empresa junto a cada uno); al elegir uno, se coloca centrado en la página actual, listo para arrastrar/redimensionar.
3. **Texto**: abre un formulario (texto, tamaño de fuente, color, negrita/cursiva/subrayado); al aceptar, se coloca como elemento igual que un sello.
4. **Firma**: abre un lienzo para dibujar con el mouse o el dedo (táctil), con color/grosor de trazo ajustable, más la lista de firmas ya guardadas del usuario (para reutilizar sin volver a dibujar). Al aceptar una firma nueva, se guarda automáticamente para uso futuro y se coloca en la página.
5. Cualquier elemento colocado se puede arrastrar, redimensionar (esquina inferior derecha) o eliminar (clic en su botón de borrar, o tecla Supr/Backspace con el elemento seleccionado).
6. **Descargar**: genera el PDF final con todos los elementos de todas las páginas incrustados, y lo descarga directamente al dispositivo del usuario.

### Gestión de sellos (pantalla de administración, dentro del mismo módulo)
Lista de sellos existentes (nombre + empresa), formulario para subir uno nuevo (elegir empresa de un desplegable + archivo PNG + nombre), botón de eliminar por sello. Gateado por `can_add` en `document_stamps`.

### Gestión de firmas (dentro de la herramienta "Firma", no requiere pantalla aparte)
La lista de firmas guardadas y la opción de eliminarlas vive directamente en el modal de "Firma" descrito en el paso 4 — no hace falta una pantalla de administración separada, ya que son personales y de uso inmediato.

## Fuera de alcance / notas
- No se valida el tipo de "empresa" del sello contra el documento cargado — el usuario elige libremente cualquier sello disponible, sin importar la empresa a la que pertenezca el PDF.
- El límite de tamaño de archivo para sellos y firmas PNG no se especifica aquí; se usará un límite razonable (ej. 2 MB) consistente con el resto de subidas de archivos de la plataforma (fotos de contacto).
