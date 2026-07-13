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
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={login} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Clave</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit" className="w-full">
          Entrar
        </Button>
      </form>
      <a href="/forgot-password" className="block text-sm text-muted-foreground underline">
        ¿Olvidaste tu clave?
      </a>
    </div>
  );
}
