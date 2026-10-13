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

export async function listSupplyArticles(): Promise<SupplyArticleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supply_articles")
    .select("id, name, code, category, unit, price, stock_quantity, low_stock_threshold, image_url, status")
    .order("name");
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
