"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToSharePoint } from "@/lib/sharepoint";
import { sendGoservicesStatusEmail } from "@/lib/sendGoservicesStatusEmail";
import { getSiteUrl } from "@/lib/siteUrl";
import { STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";

export { STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";

interface ActionResult {
  error?: string;
}

export interface CreateGoservicesRequestInput {
  requestType: "mantenimiento" | "mensajeria";
  ubicacion?: "oficina" | "alojamiento";
  categoria?: "cerrajeria" | "mobiliario" | "instalaciones_electricas" | "plomeria" | "infraestructura";
  subcategoria?: string;
  tipoMensajeria?: "envio" | "retiro" | "compras" | "traslados";
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoDireccion?: string;
  detalle: string;
  foto?: File | null;
  documento?: File | null;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function uploadAttachment(file: File, allowedTypes: Record<string, string> | null): Promise<{ url?: string; error?: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "El archivo no puede pesar más de 10 MB" };
  if (allowedTypes && !allowedTypes[file.type]) return { error: "El archivo debe ser JPG, PNG o WEBP" };
  const bytes = await file.arrayBuffer();
  try {
    const url = await uploadToSharePoint(bytes, file.name, file.type || "application/octet-stream");
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo subir el archivo" };
  }
}

export async function createGoservicesRequest(input: CreateGoservicesRequestInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autorizado" };

  if (!input.detalle.trim()) return { error: "El detalle no puede estar vacío" };

  if (input.requestType === "mantenimiento") {
    if (!input.ubicacion) return { error: "Selecciona una ubicación" };
    if (!input.categoria) return { error: "Selecciona un tipo de solicitud" };
  } else {
    if (!input.tipoMensajeria) return { error: "Selecciona un tipo de solicitud" };
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("email", user.email)
    .maybeSingle();

  let fotoUrl: string | null = null;
  if (input.foto && input.foto.size > 0) {
    const result = await uploadAttachment(input.foto, ALLOWED_PHOTO_TYPES);
    if (result.error) return { error: result.error };
    fotoUrl = result.url ?? null;
  }

  let documentoUrl: string | null = null;
  if (input.documento && input.documento.size > 0) {
    const result = await uploadAttachment(input.documento, null);
    if (result.error) return { error: result.error };
    documentoUrl = result.url ?? null;
  }

  const { error } = await supabase.from("goservices_requests").insert({
    request_type: input.requestType,
    requester_app_user_id: user.id,
    requester_contact_id: contact?.id ?? null,
    requester_name: contact ? `${contact.first_name} ${contact.last_name}` : user.email,
    ubicacion: input.requestType === "mantenimiento" ? input.ubicacion : null,
    categoria: input.requestType === "mantenimiento" ? input.categoria : null,
    subcategoria: input.requestType === "mantenimiento" ? (input.subcategoria ?? null) : null,
    tipo_mensajeria: input.requestType === "mensajeria" ? input.tipoMensajeria : null,
    contacto_nombre: input.requestType === "mensajeria" ? (input.contactoNombre ?? null) : null,
    contacto_telefono: input.requestType === "mensajeria" ? (input.contactoTelefono ?? null) : null,
    contacto_direccion: input.requestType === "mensajeria" ? (input.contactoDireccion ?? null) : null,
    detalle: input.detalle,
    foto_url: fotoUrl,
    documento_url: documentoUrl,
    status: "recibido",
  });
  if (error) return { error: error.message };

  revalidatePath("/solicitudes/goservices");
  revalidatePath("/goservices");
  return {};
}

export interface GoservicesRequestRow {
  id: string;
  createdAtLabel: string;
  requestType: "mantenimiento" | "mensajeria";
  typeLabel: string;
  requesterName: string;
  detalle: string;
  status: string;
  statusLabel: string;
  assignedAppUserId: string | null;
  ubicacion: string | null;
  subcategoria: string | null;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoDireccion: string | null;
  fotoUrl: string | null;
  documentoUrl: string | null;
}

const CATEGORIA_LABELS: Record<string, string> = {
  cerrajeria: "Cerrajería",
  mobiliario: "Mobiliario",
  instalaciones_electricas: "Instalaciones eléctricas",
  plomeria: "Plomería",
  infraestructura: "Infraestructura",
};

const TIPO_MENSAJERIA_LABELS: Record<string, string> = {
  envio: "Envío",
  retiro: "Retiro",
  compras: "Compras",
  traslados: "Traslados",
};

function typeLabel(row: { request_type: string; categoria: string | null; tipo_mensajeria: string | null }): string {
  if (row.request_type === "mantenimiento") return CATEGORIA_LABELS[row.categoria ?? ""] ?? "Mantenimiento";
  return TIPO_MENSAJERIA_LABELS[row.tipo_mensajeria ?? ""] ?? "Mensajería";
}

function toRow(r: {
  id: string;
  created_at: string;
  request_type: "mantenimiento" | "mensajeria";
  categoria: string | null;
  tipo_mensajeria: string | null;
  requester_name: string;
  detalle: string;
  status: string;
  assigned_app_user_id: string | null;
  ubicacion: string | null;
  subcategoria: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_direccion: string | null;
  foto_url: string | null;
  documento_url: string | null;
}): GoservicesRequestRow {
  return {
    id: r.id,
    createdAtLabel: new Date(r.created_at).toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "numeric" }),
    requestType: r.request_type,
    typeLabel: typeLabel(r),
    requesterName: r.requester_name,
    detalle: r.detalle,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    assignedAppUserId: r.assigned_app_user_id,
    ubicacion: r.ubicacion,
    subcategoria: r.subcategoria,
    contactoNombre: r.contacto_nombre,
    contactoTelefono: r.contacto_telefono,
    contactoDireccion: r.contacto_direccion,
    fotoUrl: r.foto_url,
    documentoUrl: r.documento_url,
  };
}

export async function listMyGoservicesRequests(): Promise<GoservicesRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("goservices_requests")
    .select(
      "id, created_at, request_type, categoria, tipo_mensajeria, requester_name, detalle, status, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, documento_url",
    )
    .eq("requester_app_user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map(toRow);
}

export async function listAssignedGoservicesRequests(): Promise<GoservicesRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("goservices_requests")
    .select(
      "id, created_at, request_type, categoria, tipo_mensajeria, requester_name, detalle, status, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, documento_url",
    )
    .eq("assigned_app_user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map(toRow);
}

export async function listAllGoservicesRequests(filters: { type?: string; status?: string }): Promise<GoservicesRequestRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("goservices_requests")
    .select(
      "id, created_at, request_type, categoria, tipo_mensajeria, requester_name, detalle, status, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, documento_url",
    )
    .order("created_at", { ascending: false });

  if (filters.type) query = query.eq("request_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);

  const { data } = await query;
  return (data ?? []).map(toRow);
}

export async function listAssignableUsers(): Promise<{ id: string; email: string }[]> {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_view) return [];

  const admin = createAdminClient();
  const { data } = await admin.from("app_users").select("id, email").eq("status", "active").order("email");
  return data ?? [];
}

export async function updateGoservicesRequestStatus(
  requestId: string,
  status: GoservicesStatus,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  if (!(status in STATUS_LABELS)) return { error: "Estatus inválido" };

  const { data: existing, error: fetchError } = await supabase
    .from("goservices_requests")
    .select("id, requester_app_user_id, request_type, categoria, tipo_mensajeria")
    .eq("id", requestId)
    .single();
  if (fetchError || !existing) return { error: "Solicitud no encontrada" };

  const { data: updated, error } = await supabase
    .from("goservices_requests")
    .update({ status })
    .eq("id", requestId)
    .select();
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

  if (status === "recibido" || status === "completado" || status === "cancelado") {
    try {
      const admin = createAdminClient();
      const { data: requester } = await admin
        .from("app_users")
        .select("email")
        .eq("id", existing.requester_app_user_id)
        .maybeSingle();
      if (requester?.email) {
        await sendGoservicesStatusEmail({
          requesterEmail: requester.email,
          typeLabel: typeLabel(existing),
          status,
          requestUrl: `${await getSiteUrl()}/solicitudes/goservices`,
        });
      }
    } catch (err) {
      console.error("Failed to send goservices status email:", err);
    }
  }

  revalidatePath("/solicitudes/goservices");
  revalidatePath("/solicitudes/goservices/asignadas");
  revalidatePath("/goservices");
  return {};
}

export async function assignGoservicesRequest(requestId: string, assignedAppUserId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_view) return { error: "No autorizado" };

  const { data: updated, error } = await supabase
    .from("goservices_requests")
    .update({ assigned_app_user_id: assignedAppUserId })
    .eq("id", requestId)
    .select();
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

  revalidatePath("/goservices");
  revalidatePath("/solicitudes/goservices");
  revalidatePath("/solicitudes/goservices/asignadas");
  return {};
}
