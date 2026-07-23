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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center text-2xl font-semibold text-zinc-900">
          Gente Sánchez Business
        </div>
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-semibold text-zinc-900">Restablecer clave</h1>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {sent && (
            <p className="text-sm text-emerald-600">
              Si tu correo está registrado, te acabamos de enviar un enlace para restablecer tu
              clave. Revisa tu bandeja de entrada (y la carpeta de spam).
            </p>
          )}
          <form action={requestPasswordReset} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-zinc-600">
                Correo
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                className="border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
              />
            </div>
            <Button type="submit" className="w-full bg-[#04B1AF] text-white hover:bg-[#039e9c]">
              Enviar enlace
            </Button>
          </form>
          {!sent && !error && (
            <p className="text-sm text-zinc-500">
              Si tu correo está registrado, recibirás un enlace para restablecer tu clave.
            </p>
          )}
          <a
            href="/login"
            className="block text-sm text-zinc-500 underline hover:text-zinc-900"
          >
            Volver a iniciar sesión
          </a>
        </div>
      </div>
    </div>
  );
}
