import { Cake } from "lucide-react";
import type { BirthdayContact } from "@/lib/contacts";
import { BirthdaysCoverflow } from "./BirthdaysCoverflow";

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
      <BirthdaysCoverflow contacts={contacts} />
    </div>
  );
}
