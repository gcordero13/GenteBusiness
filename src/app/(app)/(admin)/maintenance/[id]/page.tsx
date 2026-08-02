import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/siteUrl";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";
import { MAINTENANCE_CORRECTIVO_FIELDS } from "@/lib/maintenanceCorrectivoFields";
import { Badge } from "@/components/ui/badge";
import { CopyLinkButton } from "./CopyLinkButton";
import { SendLinkEmailButton } from "./SendLinkEmailButton";

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  completado: "Completado",
  expirado: "Expirado",
};

export default async function MaintenanceRecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const { data: record } = await supabase.from("maintenance_records").select("*").eq("id", id).single();
  if (!record) notFound();

  const siteUrl = await getSiteUrl();
  const linkUrl = `${siteUrl}/mantenimiento/${record.token}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {record.first_name} {record.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {record.company_name} · {record.department_name}
          </p>
        </div>
        <Badge variant={record.status === "completado" ? "default" : "secondary"}>
          {STATUS_LABEL[record.status] ?? record.status}
        </Badge>
      </div>

      {record.status === "pendiente" && (
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm text-muted-foreground">
            Comparte este enlace con el técnico y/o el usuario para completar el formulario y firmar.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{linkUrl}</code>
            <CopyLinkButton url={linkUrl} />
          </div>
          {record.email && (
            <div className="mt-2">
              <SendLinkEmailButton recordId={record.id} />
            </div>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Información del equipo</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Nombre del Host</dt>
          <dd>{record.host_name ?? "-"}</dd>
          <dt className="text-muted-foreground">Memoria RAM</dt>
          <dd>{record.ram ?? "-"}</dd>
          <dt className="text-muted-foreground">Sistema Operativo</dt>
          <dd>{record.os ?? "-"}</dd>
          <dt className="text-muted-foreground">Almacenamiento Total</dt>
          <dd>{record.storage_total ?? "-"}</dd>
          <dt className="text-muted-foreground">Almacenamiento Utilizado</dt>
          <dd>{record.storage_used ?? "-"}</dd>
          <dt className="text-muted-foreground">Almacenamiento Libre</dt>
          <dd>{record.storage_free ?? "-"}</dd>
        </dl>
      </section>

      {record.type === "correctivo" ? (
        <section className="space-y-4">
          <h2 className="font-medium">Diagnóstico y Solución</h2>
          {MAINTENANCE_CORRECTIVO_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground">{field.label}</h3>
              <p className="whitespace-pre-wrap text-sm">
                {(record[field.key as keyof typeof record] as string | null) ?? "-"}
              </p>
            </div>
          ))}
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="font-medium">Checklist</h2>
          <ul className="space-y-1 text-sm">
            {MAINTENANCE_CHECKLIST_ITEMS.map((item) => {
              const value = record[item.key as keyof typeof record] as boolean | null;
              return (
                <li key={item.key} className="flex items-center gap-2">
                  <span>{value === null ? "◻" : value ? "☑" : "☐"}</span>
                  <span>{item.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-1">
        <h2 className="font-medium">Hallazgos</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{record.findings || "—"}</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-medium">Observaciones</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{record.observations || "—"}</p>
      </section>

      {record.status === "completado" && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <a href={`/maintenance/${record.id}/pdf`} className="text-sm underline">
            Descargar PDF
          </a>
          {record.email_error && (
            <form action={`/maintenance/${record.id}/resend-email`} method="post">
              <button type="submit" className="text-sm text-red-600 underline">
                Reenviar correo (falló: {record.email_error})
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
