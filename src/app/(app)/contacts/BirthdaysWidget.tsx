import { Cake } from "lucide-react";
import { formatMonthDay, type BirthdayContact } from "@/lib/contacts";

function isTodayBirthday(birthDate: string | null): boolean {
  if (!birthDate) return false;
  const [, month, day] = birthDate.split("-").map(Number);
  const today = new Date();
  return month === today.getUTCMonth() + 1 && day === today.getUTCDate();
}

export function BirthdaysWidget({ contacts }: { contacts: BirthdayContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-gradient-to-br from-[#04B1AF]/10 via-white to-emerald-50 p-5 shadow-sm duration-700 dark:via-transparent">
      <div
        aria-hidden
        className="animate-blob absolute -top-10 -right-10 size-32 rounded-full bg-[#04B1AF]/10 blur-2xl"
      />
      <div className="relative mb-3 flex items-center gap-2 font-semibold">
        <span className="flex size-8 shrink-0 animate-bounce items-center justify-center rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white">
          <Cake className="size-4" />
        </span>
        Próximos cumpleaños
      </div>
      <ul className="relative space-y-1">
        {contacts.map((c, i) => {
          const today = isTodayBirthday(c.birth_date);
          return (
            <li
              key={c.id}
              className="animate-in fade-in-0 slide-in-from-left-2 flex items-center justify-between gap-4 rounded-lg px-2 py-1 text-sm duration-500"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}
            >
              <span className={today ? "font-semibold text-[#04B1AF]" : ""}>
                {c.name}
                {today && (
                  <span className="animate-pulse ml-2 rounded-full bg-[#04B1AF] px-2 py-0.5 text-xs font-medium text-white">
                    ¡Hoy!
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">
                {c.birth_date ? formatMonthDay(c.birth_date) : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
