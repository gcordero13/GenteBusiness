import { Clock, Trophy, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/contacts";

export interface AttendanceCard1Data {
  averageArrivalLabel: string | null; // formatted time, or null for "no data this month"
  phrase: string | null; // personalized motivational phrase, or null if there's no average to base it on
}

export interface AttendanceCard2Data {
  arrivalLabel: string | null; // formatted time, or null for "haven't punched in yet today"
  minutesEarly: number | null; // null if today wasn't a scheduled workday, or there's no arrival yet
}

export interface AttendanceTopArrival {
  contactId: string;
  name: string;
  photoUrl: string | null;
  arrivalLabel: string;
  minutesEarly: number;
}

export function AttendanceSummaryCards({
  card1,
  card2,
  topArrivals,
}: {
  card1: AttendanceCard1Data | null;
  card2: AttendanceCard2Data | null;
  topArrivals: AttendanceTopArrival[];
}) {
  const hasOwnCards = card1 !== null && card2 !== null;

  return (
    <div className={`grid grid-cols-1 gap-4 ${hasOwnCards ? "sm:grid-cols-2 lg:grid-cols-4" : ""}`}>
      {hasOwnCards && (
        <>
          <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <TrendingUp className="size-4 text-[#04B1AF]" />
              Mi promedio
            </div>
            <p className="mt-2 text-2xl font-bold">{card1.averageArrivalLabel ?? "Sin datos este mes"}</p>
            {card1.phrase && <p className="mt-1 text-sm text-muted-foreground">{card1.phrase}</p>}
          </div>

          <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Clock className="size-4 text-[#04B1AF]" />
              Mi llegada de hoy
            </div>
            <p className="mt-2 text-2xl font-bold">{card2.arrivalLabel ?? "Aún no has ponchado hoy"}</p>
            {card2.arrivalLabel && card2.minutesEarly !== null && (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{Math.abs(card2.minutesEarly)} min</span>{" "}
                {card2.minutesEarly >= 0 ? "antes de tu horario" : "después de tu horario"}
              </p>
            )}
          </div>
        </>
      )}

      <div className={`rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5 ${hasOwnCards ? "sm:col-span-2 lg:col-span-2" : ""}`}>
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Trophy className="size-4 text-[#04B1AF]" />
          Top 5 de hoy
        </div>
        {topArrivals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aún no hay llegadas registradas hoy.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {topArrivals.map((arrival, index) => (
              <div key={arrival.contactId} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={arrival.photoUrl ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">{getInitials(arrival.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{arrival.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Llegó a las {arrival.arrivalLabel}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#04B1AF]/10 px-2.5 py-1 text-xs font-bold text-[#04B1AF]">
                  {arrival.minutesEarly} min antes
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
