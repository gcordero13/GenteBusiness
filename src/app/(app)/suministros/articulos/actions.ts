"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ActionResult {
  error?: string;
}

export interface SupplyArticleInput {
  name: string;
  code: string;
  category: string;
  unit: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string;
}

export interface SupplyArticleRow {
  id: string;
  name: string;
  code: string;
  category: string | null;
  unit: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  status: "active" | "inactive";
}

async function callerCanManageSuministros(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "suministros" });
  return Boolean(data?.[0]?.can_manage);
}

function toRow(r: {
  id: string;
  name: string;
  code: string;
  category: string | null;
  unit: string;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  status: string;
}): SupplyArticleRow {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    category: r.category,
    unit: r.unit,
    price: r.price,
    stockQuantity: r.stock_quantity,
    lowStockThreshold: r.low_stock_threshold,
    imageUrl: r.image_url,
    status: r.status === "inactive" ? "inactive" : "active",
  };
}

export async function listSupplyArticles(options: { activeOnly?: boolean } = {}): Promise<SupplyArticleRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supply_articles")
    .select("id, name, code, category, unit, price, stock_quantity, low_stock_threshold, image_url, status")
    .order("name");
  if (options.activeOnly) query = query.eq("status", "active");
  const { data } = await query;
  return (data ?? []).map(toRow);
}

export async function createSupplyArticle(input: SupplyArticleInput): Promise<ActionResult> {
  if (!(await callerCanManageSuministros())) return { error: "No autorizado" };
  if (!input.name.trim() || !input.code.trim() || !input.unit.trim()) {
    return { error: "Nombre, código y unidad son obligatorios" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("supply_articles").insert({
    name: input.name.trim(),
    code: input.code.trim(),
    category: input.category.trim() || null,
    unit: input.unit.trim(),
    price: input.price,
    stock_quantity: input.stockQuantity,
    low_stock_threshold: input.lowStockThreshold,
    image_url: input.imageUrl.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/suministros/articulos");
  return {};
}

export async function updateSupplyArticle(id: string, input: SupplyArticleInput): Promise<ActionResult> {
  if (!(await callerCanManageSuministros())) return { error: "No autorizado" };
  if (!input.name.trim() || !input.code.trim() || !input.unit.trim()) {
    return { error: "Nombre, código y unidad son obligatorios" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("supply_articles")
    .update({
      name: input.name.trim(),
      code: input.code.trim(),
      category: input.category.trim() || null,
      unit: input.unit.trim(),
      price: input.price,
      stock_quantity: input.stockQuantity,
      low_stock_threshold: input.lowStockThreshold,
      image_url: input.imageUrl.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/suministros/articulos");
  return {};
}

export async function setSupplyArticleStatus(id: string, status: "active" | "inactive"): Promise<ActionResult> {
  if (!(await callerCanManageSuministros())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("supply_articles").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/suministros/articulos");
  return {};
}

// Columns match the fields in ArticleFormDialog, in Spanish since that's
// the language the rest of this module's UI uses.
const IMPORT_HEADERS = ["codigo", "nombre", "categoria", "unidad", "precio", "stock", "alerta_stock_bajo", "imagen_url"];

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsvRow(fields: (string | number)[]): string {
  return fields.map((f) => escapeCsvField(String(f))).join(",");
}

// A small hand-rolled parser (no extra dependency) that handles quoted
// fields containing commas/newlines, which Excel produces when a cell
// (e.g. a product name) itself contains a comma.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export async function exportSupplyArticlesCsv(): Promise<ActionResult & { csv?: string }> {
  if (!(await callerCanManageSuministros())) return { error: "No autorizado" };

  const articles = await listSupplyArticles();
  const lines = [toCsvRow(IMPORT_HEADERS)];
  for (const a of articles) {
    lines.push(
      toCsvRow([a.code, a.name, a.category ?? "", a.unit, a.price, a.stockQuantity, a.lowStockThreshold, a.imageUrl ?? ""]),
    );
  }
  return { csv: lines.join("\r\n") };
}

export async function supplyArticlesTemplateCsv(): Promise<string> {
  return [
    toCsvRow(IMPORT_HEADERS),
    toCsvRow(["P-011", "Resma de papel bond", "Papelería", "Resma", 5.5, 20, 5, "https://..."]),
  ].join("\r\n");
}

export interface ImportSupplyArticlesResult extends ActionResult {
  created?: number;
  updated?: number;
  skipped?: { row: number; reason: string }[];
}

// Upserts by código: an existing code updates that article, a new code
// creates one — so re-uploading an exported/edited file is the normal way
// to bulk-correct prices or stock, per the user's request to load data
// "de forma correcta" via a template.
export async function importSupplyArticlesCsv(csvText: string): Promise<ImportSupplyArticlesResult> {
  if (!(await callerCanManageSuministros())) return { error: "No autorizado" };

  const rows = parseCsv(csvText);
  if (rows.length < 2) return { error: "El archivo no tiene filas de datos" };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const codeIdx = col("codigo");
  const nameIdx = col("nombre");
  const unitIdx = col("unidad");
  const categoryIdx = col("categoria");
  const priceIdx = col("precio");
  const stockIdx = col("stock");
  const lowStockIdx = col("alerta_stock_bajo");
  const imageIdx = col("imagen_url");

  if (codeIdx === -1 || nameIdx === -1 || unitIdx === -1) {
    return { error: "El archivo debe incluir al menos las columnas: codigo, nombre, unidad" };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("supply_articles").select("id, code");
  const byCode = new Map((existing ?? []).map((a) => [a.code.trim(), a.id]));

  let created = 0;
  let updated = 0;
  const skipped: { row: number; reason: string }[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const code = cols[codeIdx]?.trim();
    const name = cols[nameIdx]?.trim();
    const unit = cols[unitIdx]?.trim();
    if (!code || !name || !unit) {
      skipped.push({ row: r + 1, reason: "Falta código, nombre o unidad" });
      continue;
    }

    const payload = {
      name,
      unit,
      category: categoryIdx !== -1 ? cols[categoryIdx]?.trim() || null : null,
      price: priceIdx !== -1 ? Number(cols[priceIdx]) || 0 : 0,
      stock_quantity: stockIdx !== -1 ? Number(cols[stockIdx]) || 0 : 0,
      low_stock_threshold: lowStockIdx !== -1 ? Number(cols[lowStockIdx]) || 0 : 0,
      image_url: imageIdx !== -1 ? cols[imageIdx]?.trim() || null : null,
    };

    const existingId = byCode.get(code);
    if (existingId) {
      const { error } = await admin.from("supply_articles").update(payload).eq("id", existingId);
      if (error) {
        skipped.push({ row: r + 1, reason: error.message });
        continue;
      }
      updated++;
    } else {
      const { data: inserted, error } = await admin
        .from("supply_articles")
        .insert({ code, ...payload })
        .select("id")
        .single();
      if (error || !inserted) {
        skipped.push({ row: r + 1, reason: error?.message ?? "No se pudo crear" });
        continue;
      }
      byCode.set(code, inserted.id);
      created++;
    }
  }

  revalidatePath("/suministros/articulos");
  return { created, updated, skipped: skipped.length > 0 ? skipped : undefined };
}
