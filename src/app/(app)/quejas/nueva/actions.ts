"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SubmitComplaintInput {
  category: string;
  message: string;
  isAnonymous: boolean;
  photo?: File | null;
}

interface SubmitComplaintResult {
  error?: string;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function submitComplaint(input: SubmitComplaintInput): Promise<SubmitComplaintResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  if (!input.message.trim()) return { error: "El mensaje no puede estar vacío" };

  let photoPath: string | null = null;
  if (input.photo && input.photo.size > 0) {
    if (!input.photo.type.startsWith("image/")) return { error: "El archivo debe ser una imagen" };
    if (input.photo.size > MAX_PHOTO_BYTES) return { error: "La imagen no puede pesar más de 5 MB" };

    // Uploaded via the service-role admin client, regardless of whether this
    // complaint is anonymous or named - Storage would otherwise tag the
    // object's owner with the uploader's real auth.uid(), which would leak
    // identity for an anonymous submission. The path itself is a random key,
    // never derived from the uploader's id/email.
    const admin = createAdminClient();
    const extension = input.photo.type.split("/")[1] ?? "jpg";
    const path = `${randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await input.photo.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from("complaint-photos")
      .upload(path, bytes, { contentType: input.photo.type });
    if (uploadError) return { error: uploadError.message };
    photoPath = path;
  }

  const { error } = await supabase.rpc("submit_complaint", {
    p_category: input.category,
    p_message: input.message,
    p_is_anonymous: input.isAnonymous,
    p_photo_path: photoPath,
  });
  if (error) return { error: error.message };

  return {};
}
