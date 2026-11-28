"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PLANTILLAS = ["sbc", "jsc", "kexford"] as const;

export interface CompanyInput {
  name: string;
  logoUrl: string | null;
  /** Email-signature art (background without name, photo or data). */
  firmaFondoUrl: string | null;
  /** Art of the "sin foto" version (null = the same art for both). */
  firmaFondoSinFotoUrl: string | null;
  /** Which signature design places the data on the art; null = by name. */
  firmaPlantilla: string | null;
}

export async function saveCompany(id: string | undefined, input: CompanyInput) {
  const plantilla = input.firmaPlantilla || null;
  if (plantilla && !(PLANTILLAS as readonly string[]).includes(plantilla)) {
    return { error: "Distribución de firma no válida." };
  }
  const row = {
    name: input.name,
    logo_url: input.logoUrl,
    firma_fondo_url: input.firmaFondoUrl,
    firma_fondo_sin_foto_url: input.firmaFondoSinFotoUrl,
    firma_plantilla: plantilla,
  };
  const supabase = await createClient();
  const query = id
    ? supabase.from("companies").update(row).eq("id", id)
    : supabase.from("companies").insert(row);
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/companies");
  revalidatePath("/contacts", "layout");
  return {};
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return { error: "No se puede eliminar: hay contactos asignados a esta empresa. Reasígnalos o elimínalos primero." };
    }
    return { error: error.message };
  }
  revalidatePath("/companies");
  revalidatePath("/departments");
  return {};
}
