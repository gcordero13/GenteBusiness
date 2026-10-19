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
import { sendPushToAppUsers } from "@/lib/sendPushNotification";
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
    let managerAppUserIds: string[] = [];
    if (module?.id) {
      const { data: viewerProfiles } = await admin
        .from("role_profile_permissions")
        .select("role_profile_id, role_profiles!inner(name)")
        .eq("module_id", module.id)
        .eq("can_authorize", true)
        // Super Admin also carries can_authorize (so it keeps full oversight
        // and export access), but the new-request notification is meant for
        // the actual supervisors, not system administrators — exclude it so
        // admins stop getting every new ticket by email.
        .neq("role_profiles.name", "Super Admin");
      const profileIds = (viewerProfiles ?? []).map((p: { role_profile_id: string }) => p.role_profile_id);
      if (profileIds.length > 0) {
        const { data: managerUsers } = await admin
          .from("app_users")
          .select("id, email")
          .in("role_profile_id", profileIds)
          .eq("status", "active");
        managerEmails = (managerUsers ?? []).map((u: { email: string }) => u.email);
        managerAppUserIds = (managerUsers ?? []).map((u: { id: string }) => u.id);
      }
    }
    const manageUrl = `${await getSiteUrl()}/goservices?ticket=${inserted.id}`;
    await sendGoservicesNewRequestEmail({
      managerEmails,
      requestNumber: inserted.request_number,
      requesterName,
      typeLabel: requestTypeLabel,
      subcategoria: input.requestType === "mantenimiento" ? (input.subcategoria ?? null) : null,
      departmentName,
      createdAtIso: inserted.created_at,
      detalle: input.detalle,
      manageUrl,
    });
    await sendPushToAppUsers(managerAppUserIds, {
      title: `Nueva solicitud #${inserted.request_number}`,
      body: `${requesterName} · ${requestTypeLabel}`,
      url: manageUrl,
    });

    // Also pushes to ejecutores of the matching type (mantenimiento vs
    // mensajería), even before a gestor assigns it — confirmed with the
    // user: "que el mensajero vea los tickets que le llegaron de una vez".
    // They can already see this ticket (RLS allows it while unassigned).
    if (module?.id) {
      const { data: ejecutorProfiles } = await admin
        .from("role_profile_permissions")
        .select("role_profile_id")
        .eq("module_id", module.id)
        .eq("can_manage", true);
      const ejecutorProfileIds = (ejecutorProfiles ?? []).map((p: { role_profile_id: string }) => p.role_profile_id);
      if (ejecutorProfileIds.length > 0) {
        const { data: ejecutorUsers } = await admin
          .from("app_users")
          .select("id, goservices_ejecutor_type")
          .in("role_profile_id", ejecutorProfileIds)
          .eq("status", "active");
        const matchingEjecutorIds = (ejecutorUsers ?? [])
          .filter(
            (u: { goservices_ejecutor_type: string | null }) =>
              !u.goservices_ejecutor_type || u.goservices_ejecutor_type === input.requestType,
          )
          .map((u: { id: string }) => u.id);
        await sendPushToAppUsers(matchingEjecutorIds, {
          title: `Nueva solicitud #${inserted.request_number} sin asignar`,
          body: `${requesterName} · ${requestTypeLabel}`,
          url: `${await getSiteUrl()}/solicitudes/goservices/asignadas?ticket=${inserted.id}`,
        });
      }
    }
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
      "id, request_number, created_at, request_type, categoria, tipo_mensajeria, requester_name, requester_department_name, detalle, status, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, foto_drive_id, foto_item_id, documento_url, documento_drive_id, documento_item_id",
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

  // An ejecutor also sees brand-new, still-unassigned tickets matching
  // their configured type (RLS enforces the same rule server-side) — so a
  // messenger/maintenance person sees relevant work land in "Recibido"
  // immediately, without waiting for a gestor to assign it first.
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  let orFilter = `assigned_app_user_id.eq.${user.id}`;
  if (flagsRows?.[0]?.can_manage) {
    const { data: me } = await supabase
      .from("app_users")
      .select("goservices_ejecutor_type")
      .eq("id", user.id)
      .maybeSingle();
    const myType = me?.goservices_ejecutor_type;
    orFilter += myType
      ? `,and(assigned_app_user_id.is.null,request_type.eq.${myType})`
      : `,assigned_app_user_id.is.null`;
  }

  const { data } = await supabase
    .from("goservices_requests")
    .select(
      "id, request_number, created_at, request_type, categoria, tipo_mensajeria, requester_name, requester_department_name, detalle, status, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, foto_drive_id, foto_item_id, documento_url, documento_drive_id, documento_item_id",
    )
    .or(orFilter)
    // Historical tickets imported from the old system (legacy_ticket_number
    // set) are already closed and have nothing for an ejecutor to act on -
    // excluded here so they don't bury real, active assignments.
    .is("legacy_ticket_number", null)
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
      "id, request_number, created_at, request_type, categoria, tipo_mensajeria, requester_name, requester_department_name, detalle, status, assigned_app_user_id, ubicacion, subcategoria, contacto_nombre, contacto_telefono, contacto_direccion, foto_url, foto_drive_id, foto_item_id, documento_url, documento_drive_id, documento_item_id",
    )
    .order("created_at", { ascending: false });

  if (filters.type) query = query.eq("request_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);

  const { data } = await query;
  const rows = data ?? [];
  const emailMap = await buildAssignedEmailMap(rows.map((r) => r.assigned_app_user_id));
  return rows.map((r) => toRow(r, r.assigned_app_user_id ? (emailMap.get(r.assigned_app_user_id) ?? null) : null));
}

export interface AssignableUser {
  id: string;
  email: string;
  name: string;
  // null = eligible for either request type (the prior, unrestricted
  // behavior) — set explicitly from the Users admin page to keep "el
  // mensajero" and "el de mantenimiento" from showing up for each other's
  // tickets.
  ejecutorType: "mantenimiento" | "mensajeria" | null;
}

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "goservices" });
  if (!flagsRows?.[0]?.can_authorize) return [];

  const admin = createAdminClient();
  const { data: module } = await admin.from("modules").select("id").eq("key", "goservices").single();
  if (!module?.id) return [];

  // can_manage = "ejecutor": eligible to be assigned any request regardless
  // of type — mantenimiento vs mensajería is an organizational distinction
  // via which role profile grants can_manage (e.g. the UTILITY / Mensajeria
  // profiles), not a separate code-level flag per type.
  const { data: ejecutorProfiles } = await admin
    .from("role_profile_permissions")
    .select("role_profile_id")
    .eq("module_id", module.id)
    .eq("can_manage", true);
  const profileIds = (ejecutorProfiles ?? []).map((p: { role_profile_id: string }) => p.role_profile_id);
  if (profileIds.length === 0) return [];

  const { data: users } = await admin
    .from("app_users")
    .select("id, email, full_name, goservices_ejecutor_type")
    .in("role_profile_id", profileIds)
    .eq("status", "active")
    .order("email");
  if (!users || users.length === 0) return [];

  // app_users.full_name is rarely populated — fall back to the matching
  // contacts row (the HR/directory record for the same email), which
  // already has real names for current staff, so the gestor can pick a
  // person by name instead of having to recognize their email.
  const emails = users.map((u: { email: string }) => u.email);
  const { data: contacts } = await admin.from("contacts").select("email, first_name, last_name").in("email", emails);
  const nameByEmail = new Map(
    (contacts ?? []).map((c: { email: string; first_name: string; last_name: string }) => [
      c.email,
      `${c.first_name} ${c.last_name}`.trim(),
    ]),
  );

  return users.map(
    (u: {
      id: string;
      email: string;
      full_name: string | null;
      goservices_ejecutor_type: "mantenimiento" | "mensajeria" | null;
    }) => ({
      id: u.id,
      email: u.email,
      name: u.full_name || nameByEmail.get(u.email) || u.email,
      ejecutorType: u.goservices_ejecutor_type,
    }),
  );
}

export interface GoservicesCommentRow {
  id: string;
  authorEmail: string;
  body: string;
  createdAtLabel: string;
}

export async function listGoservicesComments(requestId: string): Promise<GoservicesCommentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goservices_request_comments")
    .select("id, body, created_at, author_app_user_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  const authorIds = [...new Set(data.map((c) => c.author_app_user_id))];
  const admin = createAdminClient();
  const { data: authors } = authorIds.length > 0
    ? await admin.from("app_users").select("id, email").in("id", authorIds)
    : { data: [] };
  const emailById = new Map((authors ?? []).map((a: { id: string; email: string }) => [a.id, a.email]));

  return data.map((c) => ({
    id: c.id,
    authorEmail: emailById.get(c.author_app_user_id) ?? "Desconocido",
    body: c.body,
    createdAtLabel: new Date(c.created_at).toLocaleString("es-DO", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));
}

export async function addGoservicesComment(requestId: string, body: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!body.trim()) return { error: "El comentario no puede estar vacío" };

  const { error } = await supabase.from("goservices_request_comments").insert({
    request_id: requestId,
    author_app_user_id: user.id,
    body: body.trim(),
  });
  if (error) return { error: error.message };

  revalidatePath("/solicitudes/goservices");
  revalidatePath("/solicitudes/goservices/asignadas");
  revalidatePath("/goservices");
  return {};
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
    .select(
      "id, request_number, requester_app_user_id, request_type, categoria, tipo_mensajeria, requester_name, subcategoria, requester_department_name, created_at, detalle",
    )
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

  if (status === "completado" || status === "cancelado") {
    try {
      const admin = createAdminClient();
      const { data: requester } = await admin
        .from("app_users")
        .select("email")
        .eq("id", existing.requester_app_user_id)
        .maybeSingle();
      const requestUrl = `${await getSiteUrl()}/solicitudes/goservices?ticket=${requestId}`;
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
          requestUrl,
        });
      }
      await sendPushToAppUsers([existing.requester_app_user_id], {
        title: `Solicitud #${existing.request_number} ${STATUS_LABELS[status]}`,
        body: typeLabel(existing),
        url: requestUrl,
      });
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
  if (!flagsRows?.[0]?.can_authorize) return { error: "No autorizado" };

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
    const assignedUrl = `${await getSiteUrl()}/solicitudes/goservices/asignadas?ticket=${requestId}`;
    if (assignee?.email) {
      await sendGoservicesAssignedEmail({
        assigneeEmail: assignee.email,
        requestNumber: row.request_number,
        typeLabel: typeLabel(row),
        detalle: row.detalle,
        assignedUrl,
      });
    }
    await sendPushToAppUsers([assignedAppUserId], {
      title: `Se te asignó la solicitud #${row.request_number}`,
      body: typeLabel(row),
      url: assignedUrl,
    });
  } catch (err) {
    console.error("Failed to send goservices assigned email:", err);
  }

  revalidatePath("/goservices");
  revalidatePath("/solicitudes/goservices");
  revalidatePath("/solicitudes/goservices/asignadas");
  return {};
}
