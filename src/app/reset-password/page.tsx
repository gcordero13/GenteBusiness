import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center text-2xl font-semibold text-zinc-900">
          Gente Sánchez Business
        </div>
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-semibold text-zinc-900">Elige una nueva clave</h1>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <form action={updatePassword} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password" className="text-zinc-600">
                Nueva clave
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                className="border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
              />
              <p className="text-xs text-zinc-400">Mínimo 8 caracteres.</p>
            </div>
            <Button type="submit" className="w-full bg-[#04B1AF] text-white hover:bg-[#039e9c]">
              Guardar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
