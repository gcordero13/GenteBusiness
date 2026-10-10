import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointDownloadUrl } from "@/lib/sharepoint";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ driveId: string; itemId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { driveId, itemId } = await params;

  // Confirm this specific attachment belongs to a goservices_requests row the
  // caller can actually see — using the request-scoped client (not the admin
  // client) so the same RLS policy that gates the request itself
  // (requester/assignee/gestor) also gates its attachments, rather than just
  // trusting that driveId/itemId are hard to guess.
  const { data: fotoMatch } = await supabase
    .from("goservices_requests")
    .select("id")
    .eq("foto_drive_id", driveId)
    .eq("foto_item_id", itemId)
    .maybeSingle();
  const { data: documentoMatch } = fotoMatch
    ? { data: null }
    : await supabase
        .from("goservices_requests")
        .select("id")
        .eq("documento_drive_id", driveId)
        .eq("documento_item_id", itemId)
        .maybeSingle();
  if (!fotoMatch && !documentoMatch) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const downloadUrl = await getSharePointDownloadUrl(driveId, itemId);
    return NextResponse.redirect(downloadUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo obtener el archivo" },
      { status: 502 },
    );
  }
}
