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
  id?: string;
  isAnonymous?: boolean;
}

export interface MyComplaintRow {
  id: string;
  complaintNumber: number;
  createdAtLabel: string;
  categoryLabel: string;
  message: string;
  isAnonymous: boolean;
  status: string;
  statusLabel: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  acoso: "Acoso",
  seguridad: "Seguridad",
  etica: "Ética",
  recursos_humanos: "Recursos Humanos",
  otro: "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  declinada: "Declinada",
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function submitComplaint(input: SubmitComplaintInput): Promise<SubmitComplaintResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  if (!input.message.trim()) return { error: "El mensaje no puede estar vacío" };

  let photoPath: string | null = null;
  if (input.photo && input.photo.size > 0) {
    const extension = ALLOWED_PHOTO_TYPES[input.photo.type];
    if (!extension) return { error: "La imagen debe ser JPG, PNG, WEBP o GIF" };
    if (input.photo.size > MAX_PHOTO_BYTES) return { error: "La imagen no puede pesar más de 5 MB" };

    // Uploaded via the service-role admin client, regardless of whether this
    // complaint is anonymous or named - Storage would otherwise tag the
    // object's owner with the uploader's real auth.uid(), which would leak
    // identity for an anonymous submission. The path itself is a random key,
    // never derived from the uploader's id/email.
    const admin = createAdminClient();
    const path = `${randomUUID()}.${extension}`;
    const bytes = await input.photo.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("complaint-photos")
      .upload(path, bytes, { contentType: input.photo.type });
    if (uploadError) return { error: uploadError.message };
    photoPath = path;
  }

  const { data: newId, error } = await supabase.rpc("submit_complaint", {
    p_category: input.category,
    p_message: input.message,
    p_is_anonymous: input.isAnonymous,
    p_photo_path: photoPath,
  });
  if (error) return { error: error.message };

  return { id: newId as string, isAnonymous: input.isAnonymous };
}

export async function listMyComplaints(anonymousIds: string[]): Promise<MyComplaintRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_complaints", { p_anonymous_ids: anonymousIds });
  if (error || !data) return [];

  return data.map((c: { id: string; complaint_number: number; created_at: string; category: string; message: string; is_anonymous: boolean; status: string }) => ({
    id: c.id,
    complaintNumber: c.complaint_number,
    createdAtLabel: new Date(c.created_at).toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "numeric" }),
    categoryLabel: CATEGORY_LABELS[c.category] ?? c.category,
    message: c.message,
    isAnonymous: c.is_anonymous,
    status: c.status,
    statusLabel: STATUS_LABELS[c.status] ?? c.status,
  }));
}
