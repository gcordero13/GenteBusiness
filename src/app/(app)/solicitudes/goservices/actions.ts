"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToSharePoint } from "@/lib/sharepoint";
import {
  sendGoservicesStatusEmail,
  sendGoservicesNewRequestEmail,
  sendGoservicesAssignedEmail,
} from "@/lib/sendGoservicesStatusEmail";
import { getSiteUrl } from "@/lib/siteUrl";
import { STATUS_LABELS, type GoservicesStatus } from "@/lib/goservicesStatus";

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

async function uploadAttachment(
  file: File,
  allowedTypes: Record<string, string> | null,
): Promise<{ url?: string; driveId?: string; itemId?: string; error?: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "El archivo no puede pesar más de 10 MB" };
  if (allowedTypes && !allowedTypes[file.type]) return { error: "El archivo debe ser JPG, PNG o WEBP" };
  const bytes = await file.arrayBuffer();
  try {
    const result = await uploadToSharePoint(bytes, file.name, file.type || "application/octet-stream");
    return { url: result.webUrl, driveId: result.driveId, itemId: result.itemId };
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
    .select("id, first_name, last_name, departments(name)")
    .eq("email", user.email)
    .maybeSingle();
  const departmentName = (contact?.departments as unknown as { name: string } | null)?.name ?? null;
  const requesterName = contact ? `${contact.first_name} ${contact.last_name}` : user.email;

  let fotoUrl: string | null = null;
  let fotoDriveId: string | null = null;
  let fotoItemId: string | null = null;
  if (input.foto && input.foto.size > 0) {
    const result = await uploadAttachment(input.foto, ALLOWED_PHOTO_TYPES);
    if (result.error) return { error: result.error };
    fotoUrl = result.url ?? null;
    fotoDriveId = result.driveId ?? null;
    fotoItemId = result.itemId ?? null;
  }

  let documentoUrl: string | null = null;
  let documentoDriveId: string | null = null;
  let documentoItemId: string | null = null;
  if (input.documento && input.documento.size > 0) {
    const result = await uploadAttachment(input.documento, null);
    if (result.error) return { error: result.error };
    documentoUrl = result.url ?? null;
    documentoDriveId = result.driveId ?? null;
    documentoItemId = result.itemId ?? null;
  }

  const { data: inserted, error } = await supabase
    .from("goservices_requests")
    .insert({
      request_type: input.requestType,
      requester_app_user_id: user.id,
      requester_contact_id: contact?.id ?? null,
      requester_name: requesterName,
      requester_department_name: departmentName ?? null,
      ubicacion: input.requestType === "mantenimiento" ? input.ubicacion : null,
      categoria: input.requestType === "mantenimiento" ? input.categoria : null,
      subcategoria: input.requestType === "mantenimiento" ? (input.subcategoria ?? null) : null,
      tipo_mensajeria: input.requestType === "mensajeria" ? input.tipoMensajeria : null,
      contacto_nombre: input.requestType === "mensajeria" ? (input.contactoNombre ?? null) : null,
      contacto_telefono: input.requestType === "mensajeria" ? (input.contactoTelefono ?? null) : null,
      contacto_direccion: input.requestType === "mensajeria" ? (input.contactoDireccion ?? null) : null,
      detalle: input.detalle,
      foto_url: fotoUrl,
      foto_drive_id: fotoDriveId,
      foto_item_id: fotoItemId,
      documento_url: documentoUrl,
      documento_drive_id: documentoDriveId,
      documento_item_id: documentoItemId,
      status: "recibido",
    })
    .select("id, request_number, created_at")
    .single();
  if (error) return { error: error.message };

  const requestTypeLabel = typeLabel({
    request_type: input.requestType,
    categoria: input.categoria ?? null,
    tipo_mensajeria: input.tipoMensajeria ?? null,
  });

  try {
    await sendGoservicesStatusEmail({
      requesterEmail: user.email,
      requestNumber: inserted.request_number,
      requesterName,
      typeLabel: requestTypeLabel,
      subcategoria: input.requestType === "mantenimiento" ? (input.subcategoria ?? null) : null,
      departmentName,
      createdAtIso: inserted.created_at,
      detalle: input.detalle,
      status: "recibido",
      requestType: input.requestType,
      requestUrl: `${await getSiteUrl()}/solicitudes/goservices?ticket=${inserted.id}`,
    });
  } catch (err) {
    console.error("Failed to send goservices received email:", err);
  }

  try {
    const { data: module } = await admin.from("modules").select("id").eq("key", "goservices").single();
    let managerEmails: string[] = [];
    if (module?.id) {
      const { data: viewerProfiles } = await admin
        .from("role_profile_permissions")
        .select("role_profile_id")
        .eq("module_id", module.id)
        .eq("can_view", true);
      const profileIds = (viewerProfiles ?? []).map((p: { role_profile_id: string }) => p.role_profile_id);
      if (profileIds.length > 0) {
        const { data: managerUsers } = await admin
          .from("app_users")
          .select("email")
          .in("role_profile_id", profileIds)
          .eq("status", "active");
        managerEmails = (managerUsers ?? []).map((u: { email: string }) => u.email);
      }
    }
    await sendGoservicesNewRequestEmail({
      managerEmails,
      requestNumber: inserted.request_number,
      requesterName,
      typeLabel: requestTypeLabel,
      subcategoria: input.requestType === "mantenimiento" ? (input.subcategoria ?? null) : null,
      departmentName,
      createdAtIso: inserted.created_at,
      detalle: input.detalle,
      manageUrl: `${await getSiteUrl()}/goservices?ticket=${inserted.id}`,
    });
  } catch (err) {
    console.error("Failed to send goservices new request manager email:", err);
  }

  revalidatePath("/solicitudes/goservices");
  revalidatePath("/goservices");
  return {};
}

export interface GoservicesRequestRow {
  id: string;
  requestNumber: number;
  createdAtLabel: string;
  createdAtIso: string;
  requestType: "mantenimiento" | "mensajeria";
  typeLabel: string;
  requesterName: string;
  departmentName: string | null;
  detalle: string;
  status: string;
  statusLabel: string;
  statusNote: string | null;
  assignedAppUserId: string | null;
  assignedAppUserEmail: string | null;
  ubicacion: string | null;
  subcategoria: string | null;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoDireccion: string | null;
  fotoUrl: string | null;
  fotoDriveId: string | null;
  fotoItemId: string | null;
  documentoUrl: string | null;
  documentoDriveId: string | null;
  documentoItemId: string | null;
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
  request_number: number;
  created_at: string;
  request_type: "mantenimiento" | "mensajeria";
  categoria: string | null;
  tipo_mensajeria: string | null;
  requester_name: string;
  requester_department_name: string | null;
  detalle: string;
  status: string;
  status_note: string | null;
  assigned_app_user_id: string | null;
  ubicacion: string | null;
  subcategoria: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_direccion: string | null;
  foto_url: string | null;
  foto_drive_id: string | null;
  foto_item_id: string | null;
  documento_url: string | null;
  documento_drive_id: string | null;
  documento_item_id: string | null;
}, assignedAppUserEmail: string | null = null): GoservicesRequestRow {
  return {
    id: r.id,
    requestNumber: r.request_number,
    createdAtLabel: new Date(r.created_at).toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "numeric" }),
    createdAtIso: r.created_at,
    requestType: r.request_type,
    typeLabel: typeLabel(r),
    requesterName: r.requester_name,
    departmentName: r.requester_department_name,
    detalle: r.detalle,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    statusNote: r.status_note,
    assignedAppUserId: r.assigned_app_user_id,
    assignedAppUserEmail,
    ubicacion: r.ubicacion,
    subcategoria: r.subcategoria,
    contactoNombre: r.contacto_nombre,
    contactoTelefono: r.contacto_telefono,
    contactoDireccion: r.contacto_direccion,
    fotoUrl: r.foto_url,
    fotoDriveId: r.foto_drive_id,
    fotoItemId: r.foto_item_id,
    documentoUrl: r.documento_url,
    documentoDriveId: r.documento_drive_id,
    documentoItemId: r.documento_item_id,
  };
}

// The assignee's email isn't visible via a nested PostgREST select here:
// goservices_requests has two FKs into app_users (assigned_app_user_id and
// requester_app_user_id), which makes an embedded
// `app_users!goservices_requests_assigned_app_user_id_fkey(email)` join
// ambiguous. A separate admin-client lookup sidesteps that entirely, and
// also ensures the email resolves even when the viewing requester wouldn't
// otherwise have visibility into another app_user's row under RLS.
async function buildAssignedEmailMap(assignedAppUserIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(assignedAppUserIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin.from("app_users").select("id, email").in("id", ids);
  return new Map((data ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));
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
      "id, request_number, created_at, request_type, categoria, tipo_mensajeria, requester_name, requester_department_name, detalle, status, status_note, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, foto_drive_id, foto_item_id, documento_url, documento_drive_id, documento_item_id",
    )
    .eq("requester_app_user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const emailMap = await buildAssignedEmailMap(rows.map((r) => r.assigned_app_user_id));
  return rows.map((r) => toRow(r, r.assigned_app_user_id ? (emailMap.get(r.assigned_app_user_id) ?? null) : null));
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
      "id, request_number, created_at, request_type, categoria, tipo_mensajeria, requester_name, requester_department_name, detalle, status, status_note, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, foto_drive_id, foto_item_id, documento_url, documento_drive_id, documento_item_id",
    )
    .eq("assigned_app_user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const emailMap = await buildAssignedEmailMap(rows.map((r) => r.assigned_app_user_id));
  return rows.map((r) => toRow(r, r.assigned_app_user_id ? (emailMap.get(r.assigned_app_user_id) ?? null) : null));
}

export async function listAllGoservicesRequests(filters: { type?: string; status?: string }): Promise<GoservicesRequestRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("goservices_requests")
    .select(
      "id, request_number, created_at, request_type, categoria, tipo_mensajeria, requester_name, requester_department_name, detalle, status, status_note, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, foto_drive_id, foto_item_id, documento_url, documento_drive_id, documento_item_id",
    )
    .order("created_at", { ascending: false });

  if (filters.type) query = query.eq("request_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);

  const { data } = await query;
  const rows = data ?? [];
  const emailMap = await buildAssignedEmailMap(rows.map((r) => r.assigned_app_user_id));
  return rows.map((r) => toRow(r, r.assigned_app_user_id ? (emailMap.get(r.assigned_app_user_id) ?? null) : null));
}

export async function listAssignableUsers(): Promise<{ id: string; email: string }[]> {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_view) return [];

  const admin = createAdminClient();
  const { data: module } = await admin.from("modules").select("id").eq("key", "goservices").single();
  if (!module?.id) return [];

  const { data: ejecutorProfiles } = await admin
    .from("role_profile_permissions")
    .select("role_profile_id")
    .eq("module_id", module.id)
    .eq("can_add", true);
  const profileIds = (ejecutorProfiles ?? []).map((p: { role_profile_id: string }) => p.role_profile_id);
  if (profileIds.length === 0) return [];

  const { data } = await admin
    .from("app_users")
    .select("id, email")
    .in("role_profile_id", profileIds)
    .eq("status", "active")
    .order("email");
  return data ?? [];
}

export async function updateGoservicesRequestStatus(
  requestId: string,
  status: GoservicesStatus,
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  if (!(status in STATUS_LABELS)) return { error: "Estatus inválido" };

  const { data: existing, error: fetchError } = await supabase
    .from("goservices_requests")
    .select(
      "id, request_number, requester_app_user_id, request_type, categoria, tipo_mensajeria, requester_name, subcategoria, requester_department_name, created_at, detalle",
    )
    .eq("id", requestId)
    .single();
  if (fetchError || !existing) return { error: "Solicitud no encontrada" };

  const updatePayload: { status: GoservicesStatus; status_note?: string } = { status };
  if (note && note.trim()) updatePayload.status_note = note.trim();

  const { data: updated, error } = await supabase
    .from("goservices_requests")
    .update(updatePayload)
    .eq("id", requestId)
    .select();
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

  if (status === "completado" || status === "cancelado") {
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
          requestNumber: existing.request_number,
          requesterName: existing.requester_name,
          requestType: existing.request_type,
          typeLabel: typeLabel(existing),
          subcategoria: existing.subcategoria,
          departmentName: existing.requester_department_name,
          createdAtIso: existing.created_at,
          detalle: existing.detalle,
          status,
          requestUrl: `${await getSiteUrl()}/solicitudes/goservices?ticket=${requestId}`,
          executorNote: status === "completado" ? (updated[0]?.status_note ?? null) : undefined,
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

export async function addGoservicesStatusNote(requestId: string, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const trimmed = note.trim();
  if (!trimmed) return { error: "La nota no puede estar vacía" };

  const { data: existing, error: fetchError } = await supabase
    .from("goservices_requests")
    .select("id")
    .eq("id", requestId)
    .single();
  if (fetchError || !existing) return { error: "Solicitud no encontrada" };

  const { data: updated, error } = await supabase
    .from("goservices_requests")
    .update({ status_note: trimmed })
    .eq("id", requestId)
    .select();
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

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
    .select("id, request_number, request_type, categoria, tipo_mensajeria, detalle");
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

  try {
    const admin = createAdminClient();
    const { data: assignee } = await admin
      .from("app_users")
      .select("email")
      .eq("id", assignedAppUserId)
      .maybeSingle();
    const row = updated[0];
    if (assignee?.email) {
      await sendGoservicesAssignedEmail({
        assigneeEmail: assignee.email,
        requestNumber: row.request_number,
        typeLabel: typeLabel(row),
        detalle: row.detalle,
        assignedUrl: `${await getSiteUrl()}/solicitudes/goservices/asignadas?ticket=${requestId}`,
      });
    }
  } catch (err) {
    console.error("Failed to send goservices assigned email:", err);
  }

  revalidatePath("/goservices");
  revalidatePath("/solicitudes/goservices");
  revalidatePath("/solicitudes/goservices/asignadas");
  return {};
}
