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
