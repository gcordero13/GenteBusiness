import { NewComplaintForm } from "./NewComplaintForm";

export default function NewComplaintPage() {
  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Enviar queja o reporte</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Puedes enviarla de forma anónima o con tu nombre. Solo la puede ver la persona autorizada.
      </p>
      <NewComplaintForm />
    </div>
  );
}
