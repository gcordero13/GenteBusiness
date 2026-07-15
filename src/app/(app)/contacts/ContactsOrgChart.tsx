import { buildOrgTree, type OrgTreeNode } from "@/lib/contacts";

interface OrgContact {
  id: string;
  name: string;
  position: string | null;
  reports_to_id: string | null;
}

function OrgNode({ node }: { node: OrgTreeNode<OrgContact> }) {
  return (
    <li>
      <details open>
        <summary className="cursor-pointer py-1 text-sm">
          <a href={`/contacts/${node.contact.id}`} className="underline">
            {node.contact.name}
          </a>
          {node.contact.position && (
            <span className="text-muted-foreground"> — {node.contact.position}</span>
          )}
        </summary>
        {node.reports.length > 0 && (
          <ul className="ml-4 space-y-1 border-l pl-4">
            {node.reports.map((child) => (
              <OrgNode key={child.contact.id} node={child} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

export function ContactsOrgChart({
  contacts,
}: {
  contacts: { id: string; first_name: string; last_name: string; position: string | null; reports_to_id: string | null }[];
}) {
  const tree = buildOrgTree(
    contacts.map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      position: c.position,
      reports_to_id: c.reports_to_id,
    })),
  );

  if (tree.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        No hay relaciones de supervisor definidas todavía.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {tree.map((node) => (
        <OrgNode key={node.contact.id} node={node} />
      ))}
    </ul>
  );
}
