import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  async function submit(formData: FormData) {
    "use server";
    await requestPasswordReset(formData);
  }

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Restablecer clave</h1>
      <form action={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <Button type="submit" className="w-full">
          Enviar enlace
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Si tu correo está registrado, recibirás un enlace para restablecer tu clave.
      </p>
    </div>
  );
}
