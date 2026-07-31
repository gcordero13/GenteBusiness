import { createAdminClient } from "@/lib/supabase/admin";
import { SurveyForm } from "./SurveyForm";

export default async function SurveyPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: survey } = await admin.from("maintenance_surveys").select("status").eq("token", token).maybeSingle();

  if (!survey) {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Enlace no disponible</h1>
        <p className="text-sm text-muted-foreground">Este enlace de encuesta no es válido.</p>
      </div>
    );
  }

  if (survey.status === "respondida") {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Ya respondiste esta encuesta</h1>
        <p className="text-sm text-muted-foreground">Gracias por tu tiempo.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Encuesta de satisfacción</h1>
        <p className="text-sm text-muted-foreground">
          Nos ayudaría mucho conocer tu opinión sobre el mantenimiento recibido.
        </p>
      </div>
      <SurveyForm token={token} />
    </div>
  );
}
