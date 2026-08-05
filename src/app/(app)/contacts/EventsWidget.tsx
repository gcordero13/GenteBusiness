import { PartyPopper } from "lucide-react";
import { formatMonthDay } from "@/lib/contacts";

export interface CompanyEvent {
  id: string;
  name: string;
  event_date: string;
}

export function EventsWidget({ events }: { events: CompanyEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 px-4 py-3 duration-700">
      <div className="relative mb-1.5 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white">
          <PartyPopper className="size-3.5" />
        </span>
        Actividades y días feriados
      </div>
      <ul className="relative space-y-1 text-xs">
        {events.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-4">
            <span>{e.name}</span>
            <span className="text-muted-foreground">{formatMonthDay(e.event_date)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
