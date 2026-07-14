export interface BirthdayContact {
  id: string;
  name: string;
  birth_date: string | null;
}

function nextOccurrence(birthDate: string, today: Date): number {
  const [, month, day] = birthDate.split("-").map(Number);
  const year = today.getUTCFullYear();
  let next = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (next < todayUtc) {
    next = Date.UTC(year + 1, month - 1, day);
  }
  return next;
}

export function getUpcomingBirthdays<T extends BirthdayContact>(
  contacts: T[],
  today: Date,
  count = 5,
): T[] {
  return contacts
    .filter((c) => c.birth_date)
    .map((c) => ({ contact: c, next: nextOccurrence(c.birth_date as string, today) }))
    .sort((a, b) => a.next - b.next)
    .slice(0, count)
    .map((entry) => entry.contact);
}

export function whatsappUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}
