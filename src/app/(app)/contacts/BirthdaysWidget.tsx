import { Cake } from "lucide-react";
import type { BirthdayContact } from "@/lib/contacts";
import { BirthdaysCoverflow } from "./BirthdaysCoverflow";
import { TodayBirthdayCard } from "./TodayBirthdayCard";
import { EventsWidget, type CompanyEvent } from "./EventsWidget";
import { NewsWidget, type NewsItem } from "./NewsWidget";
import { MyProfileCard, type MyProfileCardData } from "./MyProfileCard";

export function BirthdaysWidget({
  myProfile,
  today,
  todayContacts,
  upcomingContacts,
  events,
  news,
}: {
  myProfile: MyProfileCardData | null;
  today: Date;
  todayContacts: BirthdayContact[];
  upcomingContacts: BirthdayContact[];
  events: CompanyEvent[];
  news: NewsItem[];
}) {
  if (
    !myProfile &&
    todayContacts.length === 0 &&
    upcomingContacts.length === 0 &&
    events.length === 0 &&
    news.length === 0
  ) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[0.8fr_0.8fr_1.6fr_0.8fr] md:items-stretch">
      <div className="flex flex-col gap-2 md:[grid-column:1]">
        {myProfile && <MyProfileCard data={myProfile} today={today} />}
        <EventsWidget events={events} />
      </div>
      {todayContacts.length > 0 && (
        <div className="md:[grid-column:2]">
          <TodayBirthdayCard contacts={todayContacts} />
        </div>
      )}
      {upcomingContacts.length > 0 && (
        <div
          className={`animate-in fade-in-0 slide-in-from-bottom-4 relative min-h-[460px] self-start rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 px-6 py-5 duration-700 ${
            todayContacts.length > 0 ? "md:[grid-column:3]" : "md:[grid-column:2/4]"
          }`}
        >
          <div className="relative mb-3 flex items-center gap-3 text-xl font-semibold">
            <span className="flex size-11 shrink-0 animate-bounce items-center justify-center rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white">
              <Cake className="size-6" />
            </span>
            Próximos cumpleaños
          </div>
          <BirthdaysCoverflow contacts={upcomingContacts} />
        </div>
      )}
      <div className="md:[grid-column:4]">
        <NewsWidget items={news} />
      </div>
    </div>
  );
}
