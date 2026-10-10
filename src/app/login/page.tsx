import { Mail, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginBackgroundUrl } from "@/lib/platformSettings";
import { login } from "./actions";
import { SubmitButton } from "./SubmitButton";
import { PasswordField } from "./PasswordField";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const backgroundUrl = (await getLoginBackgroundUrl()) ?? "/login-background.jpg";

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 bg-cover bg-center px-4"
      style={{ backgroundImage: `url('${backgroundUrl}')` }}
    >
      <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative w-full max-w-sm space-y-6 duration-500">
        <div className="flex flex-col items-center gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold text-zinc-900">Gente Sánchez Business</p>
            <p className="text-sm text-zinc-500">Portal interno de empleados</p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white/80 p-8 shadow-xl shadow-zinc-900/5 backdrop-blur-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Iniciar sesión</h1>
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <form action={login} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-zinc-600">
                Correo
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="border-zinc-200 bg-white pl-8 text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
                />
              </div>
            </div>
            <PasswordField />
            <SubmitButton />
          </form>
          <a
            href="/forgot-password"
            className="block text-sm text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-900"
          >
            ¿Olvidaste tu clave?
          </a>
        </div>
      </div>
    </div>
  );
}
