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
