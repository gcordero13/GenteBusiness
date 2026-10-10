import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getPlatformLogoUrl(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("logo_url")
    .eq("id", true)
    .maybeSingle();
  return data?.logo_url ?? null;
}

export async function getLoginBackgroundUrl(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("login_background_url")
    .eq("id", true)
    .maybeSingle();
  return data?.login_background_url ?? null;
}
