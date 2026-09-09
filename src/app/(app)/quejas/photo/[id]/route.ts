import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Authorized to view a complaint's photo if ANY of:
//  1. The caller passes can_view_complaints() (reviewer access).
//  2. The complaint is NOT anonymous and its contact_id resolves to the
//     caller's own contact, via the same auth.uid() -> app_users.email ->
//     contacts.email resolution submit_complaint()/list_my_complaints() use.
//  3. The complaint IS anonymous - per this module's established model
//     (list_my_complaints()), an anonymous complaint has no server-side
//     identity to verify by design, so knowing its exact, unguessable id is
//     itself sufficient proof of legitimate access.
//
// The complaint row itself must be fetched with the admin client: the
// complaints_select_viewers RLS policy only allows can_view_complaints()
// callers, so a plain session-client query would 403/return-nothing for a
// non-viewer submitter before we ever get to apply the check above.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: complaint } = await admin
    .from("complaints")
    .select("photo_path, is_anonymous, contact_id")
    .eq("id", id)
    .single();
  if (!complaint?.photo_path) {
    return NextResponse.json({ error: "Foto no disponible" }, { status: 404 });
  }

  const { data: canView } = await supabase.rpc("can_view_complaints");

  let isOwnNamedComplaint = false;
  if (!complaint.is_anonymous && complaint.contact_id) {
    const { data: myContact } = await admin
      .from("contacts")
      .select("id")
      .eq("email", user.email ?? "")
      .maybeSingle();
    isOwnNamedComplaint = myContact?.id === complaint.contact_id;
  }

  const isAuthorized = Boolean(canView) || isOwnNamedComplaint || complaint.is_anonymous;
  if (!isAuthorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: file, error } = await admin.storage.from("complaint-photos").download(complaint.photo_path);
  if (error || !file) {
    return NextResponse.json({ error: "No se pudo leer la foto" }, { status: 500 });
  }

  return new NextResponse(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
    },
  });
}
