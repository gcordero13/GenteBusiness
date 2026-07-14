import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center text-2xl font-semibold text-zinc-900">
          GenteBusiness
        </div>
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-semibold text-zinc-900">Iniciar sesión</h1>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <form action={login} className="space-y-4">
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
            <div className="space-y-1">
              <Label htmlFor="password" className="text-zinc-600">
                Clave
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#04B1AF] text-white hover:bg-[#039e9c]"
            >
              Entrar
            </Button>
          </form>
          <a
            href="/forgot-password"
            className="block text-sm text-zinc-500 underline hover:text-zinc-900"
          >
            ¿Olvidaste tu clave?
          </a>
        </div>
      </div>
    </div>
  );
}
