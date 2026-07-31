import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMaintenanceReportEmail } from "@/lib/sendMaintenanceEmail";
import { formatDateForFilename } from "@/lib/maintenancePdfReport";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_add) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: record } = await supabase
    .from("maintenance_records")
    .select("pdf_path, first_name, last_name, completed_at")
    .eq("id", id)
    .single();
  if (!record?.pdf_path) {
    return NextResponse.json({ error: "PDF no disponible" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: file, error: downloadError } = await admin.storage.from("maintenance-reports").download(record.pdf_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "No se pudo leer el PDF" }, { status: 500 });
  }

  try {
    await sendMaintenanceReportEmail({
      userName: `${record.first_name} ${record.last_name}`,
      completedDate: formatDateForFilename(new Date(record.completed_at ?? Date.now())),
      pdfBytes: new Uint8Array(await file.arrayBuffer()),
    });
    await admin.from("maintenance_records").update({ email_error: null }).eq("id", id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al enviar el correo";
    await admin.from("maintenance_records").update({ email_error: message }).eq("id", id);
    return NextResponse.redirect(new URL(`/maintenance/${id}`, _request.url));
  }

  return NextResponse.redirect(new URL(`/maintenance/${id}`, _request.url));
}
