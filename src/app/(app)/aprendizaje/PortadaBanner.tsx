import Link from "next/link";
import { Settings2 } from "lucide-react";
import { initials, primerNombre } from "@/lib/aprendizaje/portada";
import type { PerfilAprendizaje } from "@/lib/aprendizaje/types";

export function PortadaBanner({
  perfil,
  siguientePaso,
  stats,
  canManage,
}: {
  perfil: PerfilAprendizaje;
  siguientePaso: string | null;
  stats: { completados: number; enProgreso: number; certificados: number };
  canManage: boolean;
}) {
  const role = [perfil.position, perfil.department].filter(Boolean).join(" · ");
  const items = [
    { label: "Completados", value: stats.completados },
    { label: "En progreso", value: stats.enProgreso },
    { label: "Certificados", value: stats.certificados },
  ];

  return (
    <section aria-label="Bienvenida" className="relative overflow-hidden rounded-3xl bg-[#036E6C] p-6 text-white sm:p-10">
      <svg
        aria-hidden="true"
        viewBox="0 0 520 360"
        className="pointer-events-none absolute -top-16 -right-20 h-[360px] w-[520px] opacity-20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="300" cy="180" r="70" />
        <circle cx="300" cy="180" r="120" />
        <circle cx="300" cy="180" r="170" />
        <circle cx="300" cy="180" r="220" />
        <path d="M60 330 L300 180 L500 40" />
      </svg>

      <div className="relative flex flex-wrap items-center justify-between gap-8">
        <div className="flex min-w-0 flex-1 basis-[420px] items-center gap-5 sm:gap-6">
          {perfil.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Agenda photos are external URLs
            <img
              src={perfil.photoUrl}
              alt={`Foto de ${perfil.name}`}
              className="size-20 shrink-0 rounded-full border-4 border-white/85 object-cover sm:size-28"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-white/85 bg-[#D7F3F2] text-2xl font-bold text-[#036E6C] sm:size-28 sm:text-4xl"
            >
              {initials(perfil.name)}
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-semibold tracking-widest text-[#CFF5F3] uppercase">Aprendizaje</p>
            <h1 className="text-3xl leading-tight font-extrabold sm:text-4xl">Hola, {primerNombre(perfil.name)}</h1>
            {role && <p className="text-sm text-[#E6FAF9] sm:text-base">{role}</p>}
            <p className="pt-1 text-base font-medium sm:text-lg">
              {siguientePaso ?? "Explora el catálogo y empieza tu próximo curso."}
            </p>
            {canManage && (
              <Link
                href="/aprendizaje/gestion"
                className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/40 bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"
              >
                <Settings2 className="size-4" />
                Gestionar cursos
              </Link>
            )}
          </div>
        </div>

        <dl className="grid w-full max-w-md grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col rounded-2xl border border-white/30 bg-white/15 p-4">
              <dt className="order-2 text-sm text-[#E6FAF9]">{item.label}</dt>
              <dd className="order-1 text-3xl font-extrabold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
