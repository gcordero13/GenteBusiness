export interface BirthdayContact {
  id: string;
  name: string;
  birth_date: string | null;
  photo_url: string | null;
  position: string | null;
  email: string | null;
  extension: string | null;
  fleet_phone: string | null;
  has_whatsapp: boolean;
  company_name: string | null;
  department_name: string | null;
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

export function escapeIlikePattern(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

export interface OrgTreeContact {
  id: string;
  name: string;
  position: string | null;
  reports_to_id: string | null;
}

export interface OrgTreeNode<T> {
  contact: T;
  reports: OrgTreeNode<T>[];
}

export function buildOrgTree<T extends OrgTreeContact>(contacts: T[]): OrgTreeNode<T>[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];

  for (const contact of contacts) {
    const supervisorId = contact.reports_to_id;
    if (supervisorId && byId.has(supervisorId)) {
      const list = childrenOf.get(supervisorId) ?? [];
      list.push(contact);
      childrenOf.set(supervisorId, list);
    } else {
      roots.push(contact);
    }
  }

  function toNode(contact: T, ancestors: Set<string>): OrgTreeNode<T> {
    const children = (childrenOf.get(contact.id) ?? [])
      .filter((child) => !ancestors.has(child.id))
      .map((child) => toNode(child, new Set(ancestors).add(contact.id)));
    return { contact, reports: children };
  }

  return roots.map((c) => toNode(c, new Set()));
}

const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatMonthDay(dateString: string): string {
  const [, month, day] = dateString.split("-").map(Number);
  return `${day} de ${MONTH_NAMES_ES[month - 1]}`;
}

const APP_TIMEZONE = "America/Santo_Domingo";

// Vercel runs servers in UTC. Reading new Date()'s UTC calendar fields directly
// would shift "today" by a day for several hours each evening in Santo Domingo
// (UTC-4) - a real birthday could be missed for anyone checking after ~8pm local.
// This snaps to the business timezone's calendar day, encoded as that day's UTC
// midnight, so existing getUTCMonth()/getUTCDate() reads elsewhere stay correct.
export function getBusinessToday(referenceDate: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
}

export function isTodayBirthday(birthDate: string | null, today: Date = getBusinessToday()): boolean {
  if (!birthDate) return false;
  const [, month, day] = birthDate.split("-").map(Number);
  return month === today.getUTCMonth() + 1 && day === today.getUTCDate();
}

export function splitTodayBirthdays<T extends BirthdayContact>(
  contacts: T[],
  today: Date,
): { todayBirthdays: T[]; rest: T[] } {
  const todayBirthdays: T[] = [];
  const rest: T[] = [];
  for (const contact of contacts) {
    if (isTodayBirthday(contact.birth_date, today)) {
      todayBirthdays.push(contact);
    } else {
      rest.push(contact);
    }
  }
  return { todayBirthdays, rest };
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
