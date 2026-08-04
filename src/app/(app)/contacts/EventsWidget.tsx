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
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative min-h-[480px] overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-6 duration-700">
      <div
        aria-hidden
        className="animate-blob absolute -top-10 -right-10 size-32 rounded-full bg-[#04B1AF]/10 blur-2xl"
      />
      <div className="relative mb-4 flex items-center gap-2 text-lg font-semibold">
        <span className="flex size-10 shrink-0 animate-bounce items-center justify-center rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white">
          <PartyPopper className="size-5" />
        </span>
        Actividades y días feriados
      </div>
      <ul className="relative space-y-3 text-base">
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
