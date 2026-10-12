import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID keys no configuradas");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

// Sends a push notification to every browser/device subscription on file
// for the given app_users. Best-effort per subscription: a dead
// subscription (410 Gone / 404) is pruned from the table instead of
// retried, and one failure never blocks the others from being sent.
export async function sendPushToAppUsers(appUserIds: string[], payload: PushPayload): Promise<void> {
  if (appUserIds.length === 0) return;

  let configured: boolean;
  try {
    ensureVapidConfigured();
    configured = true;
  } catch (err) {
    configured = false;
    console.error("Push notifications not configured:", err);
  }
  if (!configured) return;

  const admin = createAdminClient();
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("app_user_id", appUserIds);

  if (!subscriptions || subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("Failed to send push notification:", err);
        }
      }
    }),
  );
}
