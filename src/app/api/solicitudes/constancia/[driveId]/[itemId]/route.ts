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

  // Confirm this constancia actually belongs to a vacation_requests row the
  // caller can see (the request-scoped client, so the same RLS that gates
  // the request itself also gates its constancia).
  const { data: match } = await supabase
    .from("vacation_requests")
    .select("id")
    .eq("constancia_drive_id", driveId)
    .eq("constancia_item_id", itemId)
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
