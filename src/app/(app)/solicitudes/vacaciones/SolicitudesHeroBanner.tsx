import { CalendarCheck, Palmtree, Sun, Waves } from "lucide-react";
import type { ReactNode } from "react";

interface SolicitudesHeroBannerProps {
  children?: ReactNode;
}

export function SolicitudesHeroBanner({ children }: SolicitudesHeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 px-6 py-6 text-white shadow-md sm:px-8 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
        <div className="animate-blob absolute -top-10 right-10 size-32 rounded-full bg-white/10 blur-3xl" />
        <Sun className="absolute top-4 right-24 size-12 text-white opacity-25" />
        <Palmtree className="absolute -right-4 -bottom-6 size-32 text-white opacity-20" />
        <Waves className="absolute right-28 bottom-2 size-10 text-white opacity-25" />
      </div>
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <CalendarCheck className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Solicitudes de Permisos y Vacaciones</h1>
            <p className="text-sm text-white/85">Gestiona y da seguimiento a tus solicitudes de permisos y vacaciones</p>
          </div>
        </div>
        {children && <div className="relative z-10">{children}</div>}
      </div>
    </div>
  );
}
