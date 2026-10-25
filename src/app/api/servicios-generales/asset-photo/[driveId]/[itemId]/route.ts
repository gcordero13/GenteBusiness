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

  // Same spirit as GoServices' attachment route: confirm this driveId/
  // itemId actually belongs to an asset photo rather than just trusting
  // the URL, then gate by the module's own view permission (asset photos
  // aren't owned by a specific requester like a GoServices ticket is, so
  // visibility follows the module's can_view/can_manage instead).
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "servicios_generales" });
  if (!flagsRows?.[0]?.can_view && !flagsRows?.[0]?.can_manage) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { driveId, itemId } = await params;
  const { data: match } = await supabase
    .from("general_maintenance_assets")
    .select("id")
    .eq("photo_drive_id", driveId)
    .eq("photo_item_id", itemId)
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
