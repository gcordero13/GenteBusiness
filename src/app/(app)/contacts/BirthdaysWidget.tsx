import type { BirthdayContact } from "@/lib/contacts";

export function BirthdaysWidget({ contacts }: { contacts: BirthdayContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="rounded border p-3 text-sm">
      <p className="mb-2 font-medium">Próximos cumpleaños</p>
      <ul className="space-y-1">
        {contacts.map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
    </div>
  );
}
