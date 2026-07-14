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
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Elige una nueva clave</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={updatePassword} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="password">Nueva clave</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>
        <Button type="submit" className="w-full">
          Guardar
        </Button>
      </form>
    </div>
  );
}
