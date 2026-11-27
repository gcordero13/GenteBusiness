import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * A course's certificate signature is only previewed in Gestión: learners
 * never fetch it (it's embedded server-side in their PDF), so only people
 * who manage Aprendizaje can open it.
 */
async function firmaVisible(supabase: Supabase, driveId: string, itemId: string): Promise<boolean> {
  const { data: perms } = await supabase.rpc("get_my_module_permissions", { p_module_key: "aprendizaje" });
  if (!perms?.[0]?.can_manage) return false;
  const { data } = await supabase
    .from("aprendizaje_cursos")
    .select("id")
    .eq("firma_drive_id", driveId)
    .eq("firma_item_id", itemId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Whether the signed-in caller may open this SharePoint file of Aprendizaje
 * (download, playback or the in-platform viewer). The lookups use the
 * request-scoped client, so the same RLS that hides draft courses from
 * learners also hides their files - ids alone aren't enough.
 */
export async function archivoVisible(supabase: Supabase, driveId: string, itemId: string): Promise<boolean> {
  const [archivo, video, cover] = await Promise.all([
    supabase.from("aprendizaje_leccion_archivos").select("id").eq("drive_id", driveId).eq("item_id", itemId).limit(1),
    supabase.from("aprendizaje_lecciones").select("id").eq("video_drive_id", driveId).eq("video_item_id", itemId).limit(1),
    supabase.from("aprendizaje_cursos").select("id").eq("cover_drive_id", driveId).eq("cover_item_id", itemId).limit(1),
  ]);
  if ([archivo, video, cover].some((r) => (r.data?.length ?? 0) > 0)) return true;
  // A module tutorial's video is also visible to people with that module,
  // even without Aprendizaje access (they see it in the login pop-up).
  const tutorial = await supabase.rpc("aprendizaje_tutorial_video_visible", { p_drive_id: driveId, p_item_id: itemId });
  if (tutorial.data === true) return true;
  return firmaVisible(supabase, driveId, itemId);
}
