import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Restablecer clave</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {sent && (
        <p className="text-sm text-emerald-600">
          Si tu correo está registrado, te acabamos de enviar un enlace para restablecer tu
          clave. Revisa tu bandeja de entrada (y la carpeta de spam).
        </p>
      )}
      <form action={requestPasswordReset} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <Button type="submit" className="w-full">
          Enviar enlace
        </Button>
      </form>
      {!sent && !error && (
        <p className="text-sm text-muted-foreground">
          Si tu correo está registrado, recibirás un enlace para restablecer tu clave.
        </p>
      )}
    </div>
  );
}
