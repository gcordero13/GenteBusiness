import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointDownloadUrl } from "@/lib/sharepoint";

// Redirects to a fresh, short-lived Graph download URL for a file that
// belongs to something the caller can see. The lookups use the
// request-scoped client, so the same RLS that hides draft courses from
// learners also hides their videos/files - ids alone aren't enough.
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

  const [archivo, video, cover] = await Promise.all([
    supabase.from("aprendizaje_leccion_archivos").select("id").eq("drive_id", driveId).eq("item_id", itemId).limit(1),
    supabase.from("aprendizaje_lecciones").select("id").eq("video_drive_id", driveId).eq("video_item_id", itemId).limit(1),
    supabase.from("aprendizaje_cursos").select("id").eq("cover_drive_id", driveId).eq("cover_item_id", itemId).limit(1),
  ]);
  // A module tutorial's video is also visible to people with that module,
  // even without Aprendizaje access (they see it in the login pop-up).
  const visible =
    [archivo, video, cover].some((r) => (r.data?.length ?? 0) > 0) ||
    (await supabase.rpc("aprendizaje_tutorial_video_visible", { p_drive_id: driveId, p_item_id: itemId })).data === true;
  if (!visible) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  try {
    return NextResponse.redirect(await getSharePointDownloadUrl(driveId, itemId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo obtener el archivo" },
      { status: 502 },
    );
  }
}
