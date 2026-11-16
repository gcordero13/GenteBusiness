"use server";

import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/siteUrl";
import { sendPasswordResetEmail } from "@/lib/sendPasswordResetEmail";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email"));
  const siteUrl = await getSiteUrl();

  try {
    await sendPasswordResetEmail({ email, siteUrl });
  } catch {
    // Never reveal whether the send failed because of the address or an
    // infra issue - same generic success state either way.
  }

  redirect("/forgot-password?sent=1");
}
