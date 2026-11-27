import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointPreviewUrl } from "@/lib/sharepoint";
import { archivoVisible } from "@/lib/aprendizaje/archivoAcceso";

/**
 * The in-platform viewer's URL for a guide (PDF, Word, Excel, PowerPoint):
 * Microsoft's embeddable online viewer, short-lived, so the file is seen
 * without being downloaded. Same permission rule as the file itself.
 */
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
    const url = await getSharePointPreviewUrl(driveId, itemId);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("aprendizaje vista previa:", err);
    return NextResponse.json({ error: "No se pudo mostrar este archivo aquí. Puedes descargarlo." }, { status: 502 });
  }
}
