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
    <div className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border p-4 duration-500">
      <div className="mb-3 flex items-center gap-2 font-medium">
        <PartyPopper className="size-4 text-primary" />
        Próximas actividades y días de fiesta
      </div>
      <ul className="space-y-2 text-sm">
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
