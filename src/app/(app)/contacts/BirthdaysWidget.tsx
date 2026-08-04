import { Cake } from "lucide-react";
import type { BirthdayContact } from "@/lib/contacts";
import { BirthdaysCoverflow } from "./BirthdaysCoverflow";
import { TodayBirthdayCard } from "./TodayBirthdayCard";
import { EventsWidget, type CompanyEvent } from "./EventsWidget";

export function BirthdaysWidget({
  todayContacts,
  upcomingContacts,
  events,
}: {
  todayContacts: BirthdayContact[];
  upcomingContacts: BirthdayContact[];
  events: CompanyEvent[];
}) {
  if (todayContacts.length === 0 && upcomingContacts.length === 0 && events.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.5fr_1fr] md:items-stretch">
      {todayContacts.length > 0 && <TodayBirthdayCard contacts={todayContacts} />}
      {upcomingContacts.length > 0 && (
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative min-h-[400px] overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 px-6 py-5 duration-700">
          <div
            aria-hidden
            className="animate-blob absolute -top-10 -right-10 size-32 rounded-full bg-[#04B1AF]/10 blur-2xl"
          />
          <div className="relative mb-2 flex items-center gap-3 text-xl font-semibold">
            <span className="flex size-11 shrink-0 animate-bounce items-center justify-center rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white">
              <Cake className="size-6" />
            </span>
            Próximos cumpleaños
          </div>
          <BirthdaysCoverflow contacts={upcomingContacts} />
        </div>
      )}
      <EventsWidget events={events} />
    </div>
  );
}
