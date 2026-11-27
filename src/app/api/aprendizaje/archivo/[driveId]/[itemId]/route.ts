import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointDownloadUrl } from "@/lib/sharepoint";
import { archivoVisible } from "@/lib/aprendizaje/archivoAcceso";

// Redirects to a fresh, short-lived Graph download URL for a file that
// belongs to something the caller can see (archivoVisible).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ driveId: string; itemId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { driveId, itemId } = await params;
  if (!(await archivoVisible(supabase, driveId, itemId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    return NextResponse.redirect(await getSharePointDownloadUrl(driveId, itemId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo obtener el archivo" },
      { status: 502 },
    );
  }
}
