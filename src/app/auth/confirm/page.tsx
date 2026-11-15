import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPlatformLogoUrl } from "@/lib/platformSettings";
import { confirmToken } from "./actions";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    redirect(`/login?error=${encodeURIComponent("El enlace no es válido o ya expiró.")}`);
  }

  const logoUrl = await getPlatformLogoUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center text-2xl font-semibold text-zinc-900">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img src={logoUrl} alt="" className="size-12 rounded-xl object-contain" />
          )}
          Gente Sánchez Business
        </div>
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-zinc-900">Confirma para continuar</h1>
          <p className="text-sm text-zinc-500">
            Por tu seguridad, confirma que fuiste tú quien abrió este enlace antes de continuar.
          </p>
          <form action={confirmToken}>
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next ?? "/"} />
            <Button type="submit" className="w-full bg-[#04B1AF] text-white hover:bg-[#039e9c]">
              Continuar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
