import { Cake } from "lucide-react";
import { formatMonthDay, type BirthdayContact } from "@/lib/contacts";

export function BirthdaysWidget({ contacts }: { contacts: BirthdayContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border p-4 duration-500">
      <div className="mb-3 flex items-center gap-2 font-medium">
        <Cake className="size-4 text-primary" />
        Próximos cumpleaños
      </div>
      <ul className="space-y-2 text-sm">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4">
            <span>{c.name}</span>
            <span className="text-muted-foreground">
              {c.birth_date ? formatMonthDay(c.birth_date) : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
