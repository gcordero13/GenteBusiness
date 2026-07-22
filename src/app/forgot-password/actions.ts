"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email"));
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });

  // Only surface the rate-limit error — it's a transient "try again in a bit"
  // condition, not an enumeration risk (it fires the same way regardless of
  // whether the email is registered). Any other error (e.g. "not found") is
  // intentionally swallowed so the response never reveals which addresses
  // are registered in the platform.
  if (error?.code === "over_email_send_rate_limit") {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Espera unos segundos antes de volver a intentarlo.")}`,
    );
  }

  redirect("/forgot-password?sent=1");
}
