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

  // No module-permission check here (this feature has none) - RLS on
  // plan_tarea_adjuntos already restricts this select to attachments on a
  // task the caller can see, so a match confirms authorization by itself.
  const { driveId, itemId } = await params;
  const { data: match } = await supabase
    .from("plan_tarea_adjuntos")
    .select("id")
    .eq("drive_id", driveId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (!match) {
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
