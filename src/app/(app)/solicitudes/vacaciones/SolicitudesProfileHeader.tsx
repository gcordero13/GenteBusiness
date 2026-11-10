import { Building2, Handshake, History } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/contacts";
import { formatFechaEs, type VacationDateRange } from "@/lib/vacationRequestSummary";

export interface SolicitudesProfileHeaderProps {
  name: string;
  position: string | null;
  photoUrl: string | null;
  tenure: string | null;
  lastVacation: VacationDateRange | null;
}

export function SolicitudesProfileHeader({
  name,
  position,
  photoUrl,
  tenure,
  lastVacation,
}: SolicitudesProfileHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-6 text-center">
      <Avatar className="size-32 border-4 border-white shadow-lg">
        <AvatarImage src={photoUrl ?? undefined} alt="" />
        <AvatarFallback className="text-3xl">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <p className="mt-2 text-lg font-bold">{name}</p>
      {position && <p className="text-sm text-muted-foreground">{position}</p>}

      {tenure && (
        <>
          <div className="my-2 h-px w-full bg-border" />
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-4" aria-hidden="true" />
            {tenure} en la empresa
          </div>
        </>
      )}

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-3 text-left text-sm">
        <Handshake className="size-5 shrink-0 text-[#04B1AF]" aria-hidden="true" />
        Tu bienestar también es parte de nuestro equipo
      </div>

      {lastVacation && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left text-sm">
          <History className="size-5 shrink-0 text-blue-700" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">Última vacación</p>
            <p className="mt-0.5 font-medium text-foreground">
              Del {formatFechaEs(lastVacation.date_from)} al {formatFechaEs(lastVacation.date_to)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
