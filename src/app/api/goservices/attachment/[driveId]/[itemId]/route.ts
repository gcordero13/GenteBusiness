import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointDownloadUrl } from "@/lib/sharepoint";

// This route only checks that the caller is a logged-in GenteBusiness user,
// not that they specifically have access to THIS particular request's
// attachment — acceptable here since driveId/itemId are opaque, unguessable
// SharePoint identifiers never exposed in any listing, only ever rendered
// for a request the caller could already see via RLS.
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
