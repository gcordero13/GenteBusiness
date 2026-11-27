"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Records that the person closed a module tutorial pop-up, so it doesn't show again. */
export async function cerrarTutorial(tutorialId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aprendizaje_cerrar_tutorial", { p_tutorial_id: tutorialId });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
