# Certificado de Aprendizaje Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People who finish a course can download a PDF certificate with a QR code. The QR opens a public page that confirms the certificate. Course managers set who signs each course's certificate.

**Approved design (2026-11-26):** https://claude.ai/artifact/XdwK8LiCxhmDyY6eQ2fJrz

**Certificate content (as approved):**
- **Sheet:** Carta horizontal.
- **Header:** the Sánchez Business & Corp logo (the file the user sent).
- **Body:** "Certificado de finalización" and "Certificado", then "Se otorga a {nombre}", then "por haber completado satisfactoriamente el curso {curso}", then "Completado el {fecha}".
- **Footer, three parts:**
  - Left: signature image, then the signer's name and position. Without a signature set, a blank line and "Gestión Humana".
  - Middle: a green "Curso Aprobado" seal.
  - Right: a QR code, "Escanea para verificar" and the code.
- **Never shown:** the grade and the number of classes.

**When it exists:** only when the course is completed (`aprendizaje_inscripciones.completed_at` is set). That already covers "all classes and the minimum grade".

**Who can get it:**
- Only its owner can download it.
- The public page needs no login and shows only the name, the course and the date.

**Architecture:**
- **Signature:** four nullable signature columns on `aprendizaje_cursos`, edited in Gestión. The signature image is uploaded to SharePoint like the cover.
- **Verification code:** a random `certificado_codigo` on each `aprendizaje_inscripciones` row.
- **Database functions:** two security definer RPCs.
  - `aprendizaje_mi_certificado(curso)`: the caller's own completed enrollment.
  - `aprendizaje_verificar_certificado(codigo)`: callable by anon, for the public page.
- **PDF:** generated on the fly with pdf-lib in a GET route. The QR is drawn as pdf-lib rectangles from `qrcode-generator`'s module matrix.
- **Logo:** embedded as a base64 TS module, so it doesn't depend on fetching anything at runtime.

**Tech stack:**
- Next.js 16 App Router and Supabase (RLS and RPCs)
- pdf-lib 1.17.1, plus new `qrcode-generator`
- Vitest and Testing Library

**Rules for this repo:**
- Use Bun for everything.
- The migration is pasted by the user into the Supabase SQL Editor of project yeblzz…, never `supabase db push`.
- Deploy only when the user asks.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261126160000_aprendizaje_certificados.sql` (new) | Signature columns, the code column and its generator, and both RPCs |
| `src/lib/aprendizaje/certificadoLogo.ts` (new, generated) | The logo PNG as base64 |
| `src/lib/aprendizaje/certificado.ts` (new) | Pure helpers: data types, date text, verification URL, name fitting |
| `src/lib/aprendizaje/certificadoPdf.ts` (new, server-only) | `generateCertificadoPdf()` with pdf-lib and the QR |
| `src/app/api/aprendizaje/certificado/[cursoId]/route.ts` (new) | Owner-only PDF download |
| `src/app/certificados/[codigo]/page.tsx` (new) | Public verification page |
| `src/middleware.ts` | Lets `/certificados` through without a login |
| `src/lib/aprendizaje/types.ts`, `mapCurso.ts` | `CursoDetail.firma` |
| `src/lib/aprendizaje/files.ts` | Upload kind `firma` (PNG or JPG, at most 5 MB) |
| `src/app/(app)/aprendizaje/gestion/actions.ts` | Selects the signature, `setCursoFirma()` |
| `src/app/(app)/aprendizaje/gestion/[cursoId]/FirmaCertificadoEditor.tsx` (new) | Gestión form: signer, position, image |
| `src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.tsx` | Renders the editor |
| `src/app/api/aprendizaje/archivo/[driveId]/[itemId]/route.ts` | Signature preview, for managers only |
| `src/app/(app)/aprendizaje/CertificadoCard.tsx` | "Descargar certificado (PDF)" |
| `src/app/(app)/aprendizaje/[cursoId]/CursoPortada.tsx` | Download link in the "¡Completaste este curso!" banner |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20261126160000_aprendizaje_certificados.sql`
- Test: `src/test/integration/aprendizajeCertificados.test.ts`. It runs after the user applies the SQL.

- [ ] **Step 1: Write the migration**

```sql
-- Certificates (Fase 4, approved design 2026-11-26).
-- * Who signs each course's certificate (name, position and a signature
--   image stored in SharePoint like the cover).
-- * A random verification code per enrollment, printed with a QR on the PDF.
-- * aprendizaje_mi_certificado: the caller's own certificate, only once the
--   course is completed.
-- * aprendizaje_verificar_certificado: public check behind the QR (anon);
--   returns only name, course and date.

alter table public.aprendizaje_cursos
  add column firma_nombre text,
  add column firma_cargo text,
  add column firma_drive_id text,
  add column firma_item_id text,
  add constraint aprendizaje_cursos_firma_ref_chk
    check ((firma_drive_id is null) = (firma_item_id is null));

-- 12 random hex digits (48 bits) as XXXX-XXXX-XXXX.
create or replace function public.aprendizaje_nuevo_codigo()
returns text
language sql
volatile
set search_path = public
as $$
  select substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4)
  from (select upper(replace(gen_random_uuid()::text, '-', '')) as h) x;
$$;

-- A volatile default gives every existing row its own code.
alter table public.aprendizaje_inscripciones
  add column certificado_codigo text not null default public.aprendizaje_nuevo_codigo();
alter table public.aprendizaje_inscripciones
  add constraint aprendizaje_inscripciones_certificado_codigo_key unique (certificado_codigo);

create or replace function public.aprendizaje_mi_certificado(p_curso_id uuid)
returns table (
  codigo text,
  nombre text,
  curso_title text,
  completed_at timestamptz,
  firma_nombre text,
  firma_cargo text,
  firma_drive_id text,
  firma_item_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.certificado_codigo,
         coalesce(nullif(btrim(u.full_name), ''), u.email),
         c.title,
         i.completed_at,
         c.firma_nombre,
         c.firma_cargo,
         c.firma_drive_id,
         c.firma_item_id
  from aprendizaje_inscripciones i
  join aprendizaje_cursos c on c.id = i.curso_id
  join app_users u on u.id = i.app_user_id
  where i.curso_id = p_curso_id
    and i.app_user_id = auth.uid()
    and i.completed_at is not null;
$$;

revoke execute on function public.aprendizaje_mi_certificado(uuid) from public, anon;
grant execute on function public.aprendizaje_mi_certificado(uuid) to authenticated;

create or replace function public.aprendizaje_verificar_certificado(p_codigo text)
returns table (nombre text, curso_title text, completed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(u.full_name), ''), u.email), c.title, i.completed_at
  from aprendizaje_inscripciones i
  join aprendizaje_cursos c on c.id = i.curso_id
  join app_users u on u.id = i.app_user_id
  where i.certificado_codigo = upper(btrim(p_codigo))
    and i.completed_at is not null;
$$;

revoke execute on function public.aprendizaje_verificar_certificado(text) from public;
grant execute on function public.aprendizaje_verificar_certificado(text) to anon, authenticated;
```

- [ ] **Step 2: Write the integration test**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAprendizajeTestUser, deleteAprendizajeTestUser } from "./aprendizajeTestHelpers";
import type { TestUser } from "./supabaseTestHelpers";

describe("aprendizaje certificates", () => {
  let manager: TestUser;
  let learner: TestUser;
  let other: TestUser;
  let cursoId: string;
  let leccionIds: string[];

  beforeAll(async () => {
    manager = await createAprendizajeTestUser({ canView: true, canManage: true });
    learner = await createAprendizajeTestUser({ canView: true, canManage: false });
    other = await createAprendizajeTestUser({ canView: true, canManage: false });
    const { data: curso, error } = await manager.client
      .from("aprendizaje_cursos")
      .insert({ title: "Certificado (test)", category: "curso", created_by: manager.id, status: "publicado",
        firma_nombre: "Firmante Test", firma_cargo: "Gerente de Gestión Humana" })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoId = curso.id;
    const { data: lecciones, error: lError } = await manager.client
      .from("aprendizaje_lecciones")
      .insert([{ curso_id: cursoId, position: 0, title: "Uno" }, { curso_id: cursoId, position: 1, title: "Dos" }])
      .select("id");
    if (lError || !lecciones) throw new Error(`insert lecciones: ${lError?.message}`);
    leccionIds = lecciones.map((l) => l.id as string);
  }, 90_000);

  afterAll(async () => {
    if (cursoId) await createAdminClient().from("aprendizaje_cursos").delete().eq("id", cursoId);
    for (const u of [manager, learner, other]) await deleteAprendizajeTestUser(u);
  }, 90_000);

  const miCertificado = async (user: TestUser) => {
    const { data, error } = await user.client.rpc("aprendizaje_mi_certificado", { p_curso_id: cursoId });
    if (error) throw new Error(error.message);
    return (data ?? []) as { codigo: string; nombre: string; curso_title: string; firma_cargo: string | null }[];
  };

  it("has no certificate until the course is completed", async () => {
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });
    expect(await miCertificado(learner)).toEqual([]);
  });

  it("gives the owner their certificate once completed, and nobody else", async () => {
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[1] });
    const [cert] = await miCertificado(learner);
    expect(cert).toMatchObject({ curso_title: "Certificado (test)", firma_cargo: "Gerente de Gestión Humana" });
    expect(cert.codigo).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(await miCertificado(other)).toEqual([]);
  });

  it("verifies the code publicly, without a session", async () => {
    const [cert] = await miCertificado(learner);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.rpc("aprendizaje_verificar_certificado", { p_codigo: ` ${cert.codigo.toLowerCase()} ` });
    expect(error).toBeNull();
    expect(data).toEqual([{ nombre: cert.nombre, curso_title: "Certificado (test)", completed_at: expect.any(String) }]);
    const { data: none } = await anon.rpc("aprendizaje_verificar_certificado", { p_codigo: "0000-0000-0000" });
    expect(none).toEqual([]);
  });

  it("only managers can set the course signature", async () => {
    const { data } = await learner.client.from("aprendizaje_cursos").update({ firma_nombre: "X" }).eq("id", cursoId).select("id");
    expect(data ?? []).toEqual([]);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261126160000_aprendizaje_certificados.sql src/test/integration/aprendizajeCertificados.test.ts
git commit -m "feat(aprendizaje): certificate signature, verification code and RPCs"
```

### Task 2: Logo module and QR dependency

**Files:**
- Create: `src/lib/aprendizaje/certificadoLogo.ts`, generated from the user's PNG.
- Modify: `package.json`, `bun.lock`.

- [ ] **Step 1: Add the dependency**

Run: `bun add qrcode-generator@1.4.4`

- [ ] **Step 2: Generate the logo module**

The source is the PNG the user sent, saved in the session scratchpad as `logo-sbc.png`, 870×731. It is written as one exported constant:

```ts
// Sánchez Business & Corp logo for the course certificate (PNG, 870×731),
// embedded so the PDF never depends on fetching it at runtime.
export const CERTIFICADO_LOGO_PNG_BASE64 = "iVBORw0KGgo…";
```

Generate it with a Bun one-liner that reads the file and writes `Buffer.from(bytes).toString("base64")`.

- [ ] **Step 3: Commit**

### Task 3: Pure certificate helpers

**Files:**
- Create: `src/lib/aprendizaje/certificado.ts`
- Test: `src/lib/aprendizaje/certificado.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { fechaCertificado, fitFontSize, toCertificadoData, verificacionUrl } from "./certificado";

describe("certificado helpers", () => {
  it("writes the completion date in Spanish, in Dominican Republic time", () => {
    expect(fechaCertificado("2026-11-26T02:30:00Z")).toBe("25 de noviembre de 2026");
    expect(fechaCertificado("2026-01-05T15:00:00Z")).toBe("5 de enero de 2026");
  });

  it("builds the public verification link", () => {
    expect(verificacionUrl("https://app.example.com/", "AB12-CD34-EF56")).toBe("https://app.example.com/certificados/AB12-CD34-EF56");
  });

  it("shrinks a long text until it fits", () => {
    const width = (text: string, size: number) => text.length * size * 0.5;
    expect(fitFontSize("Ana", 40, 300, width, 16)).toBe(40);
    expect(fitFontSize("x".repeat(40), 40, 300, width, 16)).toBe(16);
    expect(fitFontSize("x".repeat(20), 40, 300, width, 16)).toBe(30);
  });

  it("maps the RPC row", () => {
    expect(
      toCertificadoData({
        codigo: "AB12-CD34-EF56", nombre: "Ana Pérez", curso_title: "Ciberseguridad", completed_at: "2026-11-26T15:00:00Z",
        firma_nombre: null, firma_cargo: null, firma_drive_id: null, firma_item_id: null,
      }),
    ).toEqual({
      codigo: "AB12-CD34-EF56", nombre: "Ana Pérez", curso: "Ciberseguridad", completedAt: "2026-11-26T15:00:00Z",
      firmaNombre: null, firmaCargo: null, firmaImagen: null,
    });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun x vitest run src/lib/aprendizaje/certificado.test.ts`. Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement**

```ts
import type { DriveFileRef } from "./types";

export interface RawCertificado {
  codigo: string;
  nombre: string;
  curso_title: string;
  completed_at: string;
  firma_nombre: string | null;
  firma_cargo: string | null;
  firma_drive_id: string | null;
  firma_item_id: string | null;
}

export interface CertificadoData {
  codigo: string;
  nombre: string;
  curso: string;
  completedAt: string;
  firmaNombre: string | null;
  firmaCargo: string | null;
  firmaImagen: DriveFileRef | null;
}

export function toCertificadoData(r: RawCertificado): CertificadoData {
  return {
    codigo: r.codigo,
    nombre: r.nombre,
    curso: r.curso_title,
    completedAt: r.completed_at,
    firmaNombre: r.firma_nombre?.trim() || null,
    firmaCargo: r.firma_cargo?.trim() || null,
    firmaImagen: r.firma_drive_id && r.firma_item_id ? { driveId: r.firma_drive_id, itemId: r.firma_item_id } : null,
  };
}

/** "25 de noviembre de 2026", in the company's time zone (Santo Domingo). */
export function fechaCertificado(iso: string): string {
  return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santo_Domingo" })
    .format(new Date(iso));
}

export function verificacionUrl(siteUrl: string, codigo: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/certificados/${encodeURIComponent(codigo)}`;
}

/** Largest size ≤ max (down to min) at which the text fits maxWidth. */
export function fitFontSize(
  text: string,
  max: number,
  maxWidth: number,
  widthAt: (text: string, size: number) => number,
  min: number,
): number {
  let size = max;
  while (size > min && widthAt(text, size) > maxWidth) size -= 1;
  return size;
}
```

The expected values in the `fitFontSize` test come from this implementation:
- Width is `length × size × 0.5`.
- "x" × 40 at size s is 20s, which fits 300 only at s ≤ 15. The minimum is 16, so the function stops at 16.
- "x" × 20 is 10s ≤ 300, so s = 30.

- [ ] **Step 4: Run the tests and confirm they pass**
- [ ] **Step 5: Commit**

### Task 4: PDF generator

**Files:**
- Create: `src/lib/aprendizaje/certificadoPdf.ts`
- Test: `src/lib/aprendizaje/certificadoPdf.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PDFDocument } from "pdf-lib";
import { generateCertificadoPdf } from "./certificadoPdf";

const DATA = {
  codigo: "AB12-CD34-EF56", nombre: "María Fernández Peña", curso: "Ciberseguridad",
  completedAt: "2026-11-26T15:00:00Z", firmaNombre: "Laura Martínez", firmaCargo: "Gerente de Gestión Humana", firmaImagen: null,
};

describe("generateCertificadoPdf", () => {
  it("makes a one-page landscape Letter PDF", async () => {
    const bytes = await generateCertificadoPdf(DATA, { qrUrl: "https://x.test/certificados/AB12-CD34-EF56", firmaBytes: null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 792, height: 612 });
    expect(doc.getTitle()).toBe("Certificado - Ciberseguridad");
  });

  it("survives a missing signer, a very long name and characters the font can't draw", async () => {
    const bytes = await generateCertificadoPdf(
      { ...DATA, nombre: "Nombre Extremadamente Largo De Una Persona Con Muchos Apellidos 😀", firmaNombre: null, firmaCargo: null },
      { qrUrl: "https://x.test/certificados/AB12-CD34-EF56", firmaBytes: new Uint8Array([1, 2, 3]) },
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement**

The layout follows the approved mockup.
- **Page:** 792×612 points, with a 0.5 in margin frame.
- **Outer frame:** teal `#036E6C`, 2.5 pt.
- **Inner frame:** grey, 0.8 pt.
- **Left band:** navy-to-aqua, drawn as 3 stacked rectangles.
- **Logo:** centered at the top, scaled to 150×90.
- **Text:** Helvetica for body text, Times-Italic for the name, Times-Bold for "Certificado".
- **Footer:** 3 columns.
  - Signature: the image is embedded as PNG or JPG; an unreadable image is ignored.
  - Seal: concentric circles, aqua `#04B1AF` over teal, with white "CURSO" and "Aprobado".
  - QR: drawn from `qrcode(0, "M")`'s module matrix as dark rectangles, 74 pt square.

Characters the standard fonts can't encode are dropped by `safe()`.

```ts
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import qrcode from "qrcode-generator";
import { CERTIFICADO_LOGO_PNG_BASE64 } from "./certificadoLogo";
import { fechaCertificado, fitFontSize, type CertificadoData } from "./certificado";

const NAVY = rgb(0x0b / 255, 0x25 / 255, 0x45 / 255);
const TEAL = rgb(0x03 / 255, 0x6e / 255, 0x6c / 255);
const AQUA = rgb(0x04 / 255, 0xb1 / 255, 0xaf / 255);
const INK = rgb(0.11, 0.15, 0.2);
const MUTED = rgb(0.36, 0.42, 0.47);
const RULE = rgb(0.6, 0.64, 0.68);

/** Drops characters the standard (WinAnsi) fonts can't encode, e.g. emoji. */
function safe(font: PDFFont, text: string): string {
  return [...text].filter((ch) => { try { font.encodeText(ch); return true; } catch { return false; } }).join("").trim();
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = INK, cx = page.getWidth() / 2) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function drawQr(page: PDFPage, text: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  page.drawRectangle({ x: x - 4, y: y - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1), borderColor: RULE, borderWidth: 0.5 });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: rgb(0, 0, 0) });
      }
    }
  }
}

export async function generateCertificadoPdf(
  data: CertificadoData,
  opts: { qrUrl: string; firmaBytes: Uint8Array | null },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificado - ${data.curso}`);
  doc.setAuthor("Gente Sánchez Business");
  const page = doc.addPage([792, 612]);
  const { width: W, height: H } = page.getSize();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const timesBoldItalic = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Paper, left band, frames.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 0.996, 0.984) });
  page.drawRectangle({ x: 0, y: (H * 2) / 3, width: 11, height: H / 3, color: NAVY });
  page.drawRectangle({ x: 0, y: H / 3, width: 11, height: H / 3, color: TEAL });
  page.drawRectangle({ x: 0, y: 0, width: 11, height: H / 3, color: AQUA });
  page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: TEAL, borderWidth: 2.5 });
  page.drawRectangle({ x: 28, y: 28, width: W - 56, height: H - 56, borderColor: RULE, borderWidth: 0.8 });

  // Logo.
  const logo = await doc.embedPng(Buffer.from(CERTIFICADO_LOGO_PNG_BASE64, "base64"));
  const logoDims = logo.scaleToFit(150, 90);
  page.drawImage(logo, { x: (W - logoDims.width) / 2, y: H - 46 - logoDims.height, ...logoDims });

  // Titles and recipient.
  let y = H - 46 - logoDims.height - 26;
  centered(page, "CERTIFICADO DE FINALIZACIÓN", y, helvBold, 9.5, TEAL);
  y -= 40;
  centered(page, "Certificado", y, timesBold, 36, NAVY);
  y -= 30;
  centered(page, "Se otorga a", y, helv, 11, MUTED);
  const nombre = safe(timesBoldItalic, data.nombre);
  const nombreSize = fitFontSize(nombre, 34, W - 220, (t, s) => timesBoldItalic.widthOfTextAtSize(t, s), 18);
  y -= 38;
  centered(page, nombre, y, timesBoldItalic, nombreSize, INK);
  const nombreWidth = Math.max(260, timesBoldItalic.widthOfTextAtSize(nombre, nombreSize) + 40);
  page.drawLine({ start: { x: (W - nombreWidth) / 2, y: y - 8 }, end: { x: (W + nombreWidth) / 2, y: y - 8 }, thickness: 0.8, color: AQUA });
  y -= 32;
  centered(page, "por haber completado satisfactoriamente el curso", y, helv, 11, MUTED);
  const curso = safe(helvBold, data.curso);
  const cursoSize = fitFontSize(curso, 19, W - 220, (t, s) => helvBold.widthOfTextAtSize(t, s), 11);
  y -= 26;
  centered(page, curso, y, helvBold, cursoSize, NAVY);
  y -= 22;
  centered(page, `Completado el ${fechaCertificado(data.completedAt)}`, y, helv, 10, MUTED);

  // Footer: signature (left), seal (middle), QR (right).
  const footY = 62;
  const colW = 190;
  const leftCx = 60 + colW / 2;
  const rightX = W - 60 - colW;

  const firma = opts.firmaBytes ? await embedImage(doc, opts.firmaBytes) : null;
  if (firma) {
    const d = firma.scaleToFit(150, 46);
    page.drawImage(firma, { x: leftCx - d.width / 2, y: footY + 34, ...d });
  }
  page.drawLine({ start: { x: leftCx - 85, y: footY + 30 }, end: { x: leftCx + 85, y: footY + 30 }, thickness: 0.7, color: RULE });
  const firmante = data.firmaNombre ? safe(helvBold, data.firmaNombre) : "Gestión Humana";
  centered(page, firmante, footY + 16, helvBold, 9.5, INK, leftCx);
  if (data.firmaNombre && data.firmaCargo) centered(page, safe(helv, data.firmaCargo), footY + 4, helv, 8, MUTED, leftCx);

  const sealCx = W / 2;
  const sealCy = footY + 40;
  page.drawCircle({ x: sealCx, y: sealCy, size: 40, color: rgb(1, 1, 1), borderColor: AQUA, borderWidth: 1.2 });
  page.drawCircle({ x: sealCx, y: sealCy, size: 35, color: AQUA });
  page.drawCircle({ x: sealCx, y: sealCy, size: 35, borderColor: TEAL, borderWidth: 2 });
  centered(page, "CURSO", sealCy + 6, helvBold, 7.5, rgb(1, 1, 1), sealCx);
  centered(page, "Aprobado", sealCy - 12, timesBoldItalic, 16, rgb(1, 1, 1), sealCx);

  const qrSize = 74;
  drawQr(page, opts.qrUrl, rightX, footY - 4, qrSize);
  const textX = rightX + qrSize + 14;
  page.drawText("Escanea para verificar", { x: textX, y: footY + 46, size: 9.5, font: helvBold, color: INK });
  page.drawText("Constancia en línea de", { x: textX, y: footY + 32, size: 8, font: helv, color: MUTED });
  page.drawText("Gente Sánchez Business", { x: textX, y: footY + 21, size: 8, font: helv, color: MUTED });
  page.drawText(data.codigo, { x: textX, y: footY + 6, size: 9, font: helvBold, color: TEAL });

  return doc.save();
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Also render a sample PDF to the scratchpad and look at it. Fix any overlap before going on.
- [ ] **Step 5: Commit**

### Task 5: Owner-only download route

**Files:**
- Create: `src/app/api/aprendizaje/certificado/[cursoId]/route.ts`
- Test: `src/app/api/aprendizaje/certificado/[cursoId]/route.test.ts`

The route works in this order:
1. Signed-in user only, otherwise 401.
2. Calls rpc `aprendizaje_mi_certificado`. No row gives 404 "Aún no tienes el certificado de este curso".
3. Gets the signature bytes through `getSharePointDownloadUrl` plus a `fetch`. If that fails, it continues without the signature.
4. Builds `qrUrl` from `verificacionUrl(await getSiteUrl(), codigo)`.
5. Returns the PDF with:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="Certificado.pdf"; filename*=UTF-8''Certificado%20-%20<curso>.pdf`
   - `Cache-Control: private, no-store`

Tests mock `@/lib/supabase/server`, `@/lib/sharepoint`, `@/lib/siteUrl` and `@/lib/aprendizaje/certificadoPdf`. They cover the 401, the 404 for an incomplete course, the 200 with the headers, and the QR URL passed to the generator.

### Task 6: Public verification page

**Files:**
- Create: `src/app/certificados/[codigo]/page.tsx`
- Modify: `src/middleware.ts`, adding `request.nextUrl.pathname.startsWith("/certificados")` to the public routes.
- Test: `src/app/certificados/[codigo]/page.test.tsx`

The page is a server component.
- **Data:** it calls `createClient()` (anon when signed out) and then `rpc("aprendizaje_verificar_certificado", { p_codigo })`.
- **Valid certificate:** it shows the logo, the "Certificado válido" heading and the person's name. Below come "completó el curso {curso}" and "el {fecha}", then "Código {codigo}".
- **Unknown code:** it shows "No encontramos este certificado" with "Revisa el código o escanea de nuevo el QR."
- **Metadata:** `export const metadata = { title: "Verificar certificado", robots: { index: false } }`.
- **Tests:** they mock the supabase client and render both states.

### Task 7: Course signature in Gestión

**Files:**
- Modify: `src/lib/aprendizaje/types.ts`. Add `CursoFirma { nombre: string | null; cargo: string | null; imagen: DriveFileRef | null }` and `CursoDetail.firma: CursoFirma`.
- Modify: `src/lib/aprendizaje/mapCurso.ts`. `RawCurso` gets the optional fields `firma_nombre`, `firma_cargo`, `firma_drive_id` and `firma_item_id`, mapped to `firma`. Test this in `mapCurso.test.ts`.
- Modify: `src/lib/aprendizaje/files.ts`. Add `UploadKind` `"firma"` with `FIRMA_TYPES = ["image/png", "image/jpeg"]` and a 5 MB limit. The error reads "La firma debe ser una imagen PNG o JPG." Test it in `files.test.ts` if one exists, otherwise add one.
- Modify: `src/app/(app)/aprendizaje/gestion/actions.ts`.
  - Add the 4 columns to `CURSO_DETAIL_SELECT`.
  - Add `setCursoFirma(cursoId, { nombre, cargo, imagen })`. It trims the text, stores null for empty values, and returns "Escribe el nombre de quien firma." when there is an image or a position but no name. It then calls `revalidateCurso`.
- Create: `src/app/(app)/aprendizaje/gestion/[cursoId]/FirmaCertificadoEditor.tsx`, with a test.
  - **Section:** "Firma del certificado". The text says: "Aparece en el certificado que reciben quienes terminan el curso. Si lo dejas vacío, sale la línea de firma con «Gestión Humana»."
  - **Fields:** "Nombre de quien firma" and "Cargo".
  - **Signature image:** a preview through `archivoUrl`, `SharePointUploadButton kind="firma"` labelled "Subir firma" or "Cambiar firma", and a "Quitar firma" button.
  - **Save:** "Guardar firma".
  - **On upload:** the button calls `setCursoFirma` with the current text and the new image.
- Modify: `CursoEditor.tsx` renders `<FirmaCertificadoEditor curso={curso} />` after `TutorialModuloEditor`. Update `CursoEditor.test.tsx` mocks and `CURSO` fixtures across the tests to include `firma: { nombre: null, cargo: null, imagen: null }`.
- Modify: `src/app/api/aprendizaje/archivo/[driveId]/[itemId]/route.ts`. A file that matches a course's `firma_drive_id`/`firma_item_id` is visible only when `get_my_module_permissions('aprendizaje')` returns `can_manage`.

### Task 8: Download buttons for learners

**Files:**
- Modify: `src/app/(app)/aprendizaje/CertificadoCard.tsx`.
  - The card is no longer one big link. It becomes a `div`: the title is a `Link` to the course, and a plain `<a href="/api/aprendizaje/certificado/{id}">` "Descargar certificado (PDF)" with a Download icon replaces "PDF próximamente".
  - Keep the person's own grade on the card. The user's "no grade" applies to the certificate itself.
  - Test: `CertificadoCard.test.tsx`.
- Modify: `src/app/(app)/aprendizaje/[cursoId]/CursoPortada.tsx`. When `curso.completedAt` is set and the course isn't a preview, add the same download link next to "¡Completaste este curso!". Add a `CursoPortada.test.tsx` case, and a negative one for an unfinished course.

### Task 9: Verify

- [ ] `bun x vitest run src/lib/aprendizaje src/app/(app)/aprendizaje src/app/certificados src/app/api/aprendizaje --testTimeout 30000`
- [ ] `bun x tsc --noEmit -p .`
- [ ] `bun x eslint` on the changed files
- [ ] `bun --bun next build`
- [ ] Merge into main locally with a fast-forward.
- [ ] The user pastes the migration. Then run `src/test/integration/aprendizajeCertificados.test.ts`. Deploy only when the user says so.
