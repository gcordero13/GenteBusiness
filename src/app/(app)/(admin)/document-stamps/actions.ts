"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface ActionResult {
  error?: string;
}

export async function uploadSeal(formData: FormData): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const name = String(formData.get("name") ?? "");
  const file = formData.get("file");

  if (!companyId || !name || !(file instanceof File) || file.size === 0) {
    return { error: "Completa todos los campos" };
  }

  if (file.type !== "image/png") {
    return { error: "El archivo debe ser una imagen PNG" };
  }

  const supabase = await createClient();
  const path = `${companyId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("company-seals")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await supabase.from("company_seals").insert({
    company_id: companyId,
    name,
    storage_path: path,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/document-stamps");
  return {};
}

export async function deleteSeal(id: string, storagePath: string): Promise<ActionResult> {
  const supabase = await createClient();

  await supabase.storage.from("company-seals").remove([storagePath]);

  const { error } = await supabase.from("company_seals").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/document-stamps");
  return {};
}

export async function saveSignature(dataUrl: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    return { error: "Firma inválida" };
  }
  const path = `${user.id}/firma_${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("user-signatures")
    .upload(path, bytes, { contentType: "image/png" });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await supabase.from("user_signatures").insert({
    user_id: user.id,
    storage_path: path,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/document-stamps");
  return {};
}

export async function deleteSignature(id: string, storagePath: string): Promise<ActionResult> {
  const supabase = await createClient();

  await supabase.storage.from("user-signatures").remove([storagePath]);

  const { error } = await supabase.from("user_signatures").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/document-stamps");
  return {};
}
