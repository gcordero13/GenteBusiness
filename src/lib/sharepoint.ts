import "server-only";

interface GraphTokenResponse {
  access_token: string;
}

interface GraphSiteResponse {
  id: string;
}

interface GraphUploadResponse {
  webUrl: string;
  id: string;
  parentReference: { driveId: string };
}

export interface SharePointUploadResult {
  webUrl: string;
  driveId: string;
  itemId: string;
}

function parseSiteUrl(siteUrl: string): { hostname: string; serverRelativePath: string } {
  const parsed = new URL(siteUrl);
  return { hostname: parsed.hostname, serverRelativePath: parsed.pathname };
}

async function getGraphAccessToken(): Promise<string> {
  const tenantId = process.env.ONEDRIVE_TENANT_ID;
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Faltan las variables de entorno de SharePoint/OneDrive");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`No se pudo obtener el token de Microsoft Graph: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphTokenResponse;
  return data.access_token;
}

async function getSiteId(accessToken: string): Promise<string> {
  const siteUrl = process.env.SHAREPOINT_SITE_URL;
  if (!siteUrl) throw new Error("Falta SHAREPOINT_SITE_URL");
  const { hostname, serverRelativePath } = parseSiteUrl(siteUrl);

  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${hostname}:${serverRelativePath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`No se pudo resolver el sitio de SharePoint: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphSiteResponse;
  return data.id;
}

/**
 * Uploads a file to the GoServices SharePoint site's default drive and
 * returns its webUrl plus the driveId/itemId needed to fetch a fresh
 * download link later (see getSharePointDownloadUrl) — webUrl is a
 * page-viewer link that requires the viewer's own Microsoft 365 session and
 * can't be used as an <img src>. Small-file simple upload (PUT
 * .../content) — fine for the maintenance/mensajería photos and documents
 * this is used for; large files would need Graph's resumable upload session
 * instead, which this doesn't implement.
 */
export async function uploadToSharePoint(
  bytes: ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<SharePointUploadResult> {
  const accessToken = await getGraphAccessToken();
  const siteId = await getSiteId(accessToken);

  const path = `goservices/${crypto.randomUUID()}-${encodeURIComponent(filename)}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${path}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    throw new Error(`No se pudo subir el archivo a SharePoint: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphUploadResponse;
  return { webUrl: data.webUrl, driveId: data.parentReference.driveId, itemId: data.id };
}

/**
 * Fetches a fresh, short-lived Graph download URL for an already-uploaded
 * item. The download URL itself can't be persisted (it expires), so callers
 * should store driveId/itemId and call this on each request.
 */
export const MAX_SHAREPOINT_PHOTO_BYTES = 10 * 1024 * 1024;

export const ALLOWED_SHAREPOINT_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface SharePointPhotoUploadResult {
  url?: string;
  driveId?: string;
  itemId?: string;
  error?: string;
}

// Shared photo-upload helper so every module stores photos the same way
// (SharePoint, via uploadToSharePoint) instead of each one inventing its
// own storage - confirmed with the user ("todos los proyectos quiero que
// guarden la foto en esos lugares"). GoServices predates this helper and
// keeps its own inline copy (plus document-upload support this doesn't
// need) rather than being refactored to depend on it - new photo features
// (e.g. Servicios Generales' asset photos) should call this one.
export async function uploadSharePointPhoto(file: File): Promise<SharePointPhotoUploadResult> {
  if (file.size > MAX_SHAREPOINT_PHOTO_BYTES) return { error: "El archivo no puede pesar más de 10 MB" };
  if (!ALLOWED_SHAREPOINT_PHOTO_TYPES[file.type]) return { error: "El archivo debe ser JPG, PNG o WEBP" };
  const bytes = await file.arrayBuffer();
  try {
    const result = await uploadToSharePoint(bytes, file.name, file.type || "application/octet-stream");
    return { url: result.webUrl, driveId: result.driveId, itemId: result.itemId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo subir el archivo" };
  }
}

export const MAX_SHAREPOINT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_SHAREPOINT_ATTACHMENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export interface SharePointAttachmentUploadResult {
  url?: string;
  driveId?: string;
  itemId?: string;
  error?: string;
}

// Generalized sibling of uploadSharePointPhoto for features needing
// multiple files per record and non-image types (Planificación's task
// attachments) - same SharePoint-backed mechanism, wider type/size
// allowance, never a new Supabase Storage bucket.
export async function uploadSharePointAttachment(file: File): Promise<SharePointAttachmentUploadResult> {
  if (file.size > MAX_SHAREPOINT_ATTACHMENT_BYTES) return { error: "El archivo no puede pesar más de 20 MB" };
  if (!ALLOWED_SHAREPOINT_ATTACHMENT_TYPES[file.type]) {
    return { error: "Tipo de archivo no permitido (usa imagen, PDF o Word/Excel)" };
  }
  const bytes = await file.arrayBuffer();
  try {
    const result = await uploadToSharePoint(bytes, file.name, file.type || "application/octet-stream");
    return { url: result.webUrl, driveId: result.driveId, itemId: result.itemId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo subir el archivo" };
  }
}

export async function getSharePointDownloadUrl(driveId: string, itemId: string): Promise<string> {
  const accessToken = await getGraphAccessToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?select=@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`No se pudo obtener el enlace de descarga: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { "@microsoft.graph.downloadUrl"?: string };
  if (!data["@microsoft.graph.downloadUrl"]) {
    throw new Error("El archivo no tiene un enlace de descarga disponible");
  }
  return data["@microsoft.graph.downloadUrl"];
}
