"use server";

import { createClient } from "@/lib/supabase/server";

interface SavePushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(input: SavePushSubscriptionInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      app_user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };

  return {};
}
