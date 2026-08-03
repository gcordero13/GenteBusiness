import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: record } = await supabase.from("maintenance_records").select("pdf_path, first_name, last_name").eq("id", id).single();
  if (!record?.pdf_path) {
    return NextResponse.json({ error: "PDF no disponible" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: file, error } = await admin.storage.from("maintenance-reports").download(record.pdf_path);
  if (error || !file) {
    return NextResponse.json({ error: "No se pudo leer el PDF" }, { status: 500 });
  }

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Mantenimiento - ${record.first_name} ${record.last_name}.pdf"`,
    },
  });
}
