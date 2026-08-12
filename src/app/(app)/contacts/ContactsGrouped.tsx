import { ContactsTable, type ContactRow } from "./ContactsTable";

export function ContactsGrouped({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
  const groups = new Map<string, ContactRow[]>();
  for (const contact of contacts) {
    const key = contact.companies?.name ?? "Sin empresa";
    const list = groups.get(key) ?? [];
    list.push(contact);
    groups.set(key, list);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      {sortedGroups.map(([companyName, groupContacts]) => (
        <details key={companyName} open className="rounded-lg border">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            {companyName} ({groupContacts.length})
          </summary>
          <div className="border-t p-2">
            <ContactsTable contacts={groupContacts} canEdit={canEdit} />
          </div>
        </details>
      ))}
    </div>
  );
}
