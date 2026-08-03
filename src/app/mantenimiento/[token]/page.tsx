import { loadMaintenanceRecordByToken } from "@/lib/maintenanceAccess";
import { MaintenanceForm, type MaintenanceFormRecord } from "./MaintenanceForm";
import { SignaturePad } from "./SignaturePad";

export const runtime = "nodejs";

interface FullRecord extends MaintenanceFormRecord {
  id: string;
  status: string;
  expires_at: string;
  technician_signature_path: string | null;
  user_signature_path: string | null;
}

export default async function MaintenancePublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadMaintenanceRecordByToken<FullRecord>(token);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Enlace no disponible</h1>
        <p className="text-sm text-muted-foreground">
          Este enlace ya no es válido. Solicita uno nuevo al técnico.
        </p>
      </div>
    );
  }

  const record = result.record;

  if (record.status === "completado") {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Mantenimiento completado</h1>
        <p className="text-sm text-muted-foreground">
          Este formulario ya fue firmado por ambas partes. Gracias.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">
          Formulario de Mantenimiento {record.type === "correctivo" ? "Correctivo" : "Preventivo"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Completa la información y firma para finalizar.
        </p>
      </div>
      <MaintenanceForm token={token} record={record} />
      <section className="space-y-4 border-t pt-4">
        <h2 className="font-medium">Firmas</h2>
        <SignaturePad
          token={token}
          role="technician"
          label="Firma del Técnico"
          alreadySigned={Boolean(record.technician_signature_path)}
        />
        <SignaturePad
          token={token}
          role="user"
          label="Firma del Usuario"
          alreadySigned={Boolean(record.user_signature_path)}
        />
      </section>
    </div>
  );
}
