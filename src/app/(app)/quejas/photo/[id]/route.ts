import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("can_view_complaints");
  if (!canView) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: complaint } = await supabase.from("complaints").select("photo_path").eq("id", id).single();
  if (!complaint?.photo_path) {
    return NextResponse.json({ error: "Foto no disponible" }, { status: 404 });
  }

  const admin = createAdminClient();
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
