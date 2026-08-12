"use client";

import { useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildOrgTree, type OrgTreeNode } from "@/lib/contacts";
import { ContactViewDialog } from "./ContactViewDialog";
import type { ContactRow } from "./ContactsTable";

type OrgContact = ContactRow & { name: string };

function OrgPerson({
  contact,
  depth,
  canEdit,
}: {
  contact: OrgContact;
  depth: number;
  canEdit: boolean;
}) {
  const initials = `${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase();

  return (
    <ContactViewDialog contact={contact} canEdit={canEdit}>
      <div className="flex w-32 flex-col items-center gap-1 text-center">
        {depth === 0 ? (
          <div className="rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 p-1">
            <Avatar className="size-16 border-2 border-white shadow-sm">
              <AvatarImage src={contact.photo_url ?? undefined} alt="" />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <Avatar className="size-16 border-2 border-[#04B1AF] shadow-sm">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
        )}
        <span className="max-w-[128px] truncate text-sm font-semibold">{contact.name}</span>
        {contact.position && (
          <span className="max-w-[128px] truncate text-xs text-muted-foreground">
            {contact.position}
          </span>
        )}
        {contact.departments?.name && (
          <span className="max-w-[128px] truncate text-[11px] font-medium text-[#04B1AF]">
            {contact.departments.name}
          </span>
        )}
      </div>
    </ContactViewDialog>
  );
}

function OrgBranch({
  node,
  depth,
  canEdit,
  collapsed,
  onToggle,
}: {
  node: OrgTreeNode<OrgContact>;
  depth: number;
  canEdit: boolean;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const children = node.reports;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(node.contact.id);

  return (
    <div className="flex flex-col items-center">
      <OrgPerson contact={node.contact} depth={depth} canEdit={canEdit} />
      {hasChildren && (
        <>
          <button
            type="button"
            onClick={() => onToggle(node.contact.id)}
            aria-label={isCollapsed ? `Expandir equipo de ${node.contact.name}` : `Colapsar equipo de ${node.contact.name}`}
            aria-expanded={!isCollapsed}
            className="z-10 mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-[#04B1AF] bg-background text-[#04B1AF] shadow-sm hover:bg-[#04B1AF]/10"
          >
            {isCollapsed ? <Plus className="size-3" /> : <Minus className="size-3" />}
          </button>
          {!isCollapsed && (
            <>
              <div className="h-6 w-px bg-[#04B1AF]/40" />
              <div className="flex justify-center">
                {children.map((child, i) => {
                  const isFirst = i === 0;
                  const isLast = i === children.length - 1;
                  const isOnly = children.length === 1;

                  return (
                    <div key={child.contact.id} className="flex flex-col items-center px-4">
                      {!isOnly && (
                        <div className="relative h-0 w-full">
                          <div
                            className={`absolute top-0 h-px bg-[#04B1AF]/40 ${
                              isFirst ? "left-1/2 right-0" : isLast ? "left-0 right-1/2" : "left-0 right-0"
                            }`}
                          />
                        </div>
                      )}
                      <div className="h-6 w-px bg-[#04B1AF]/40" />
                      <OrgBranch
                        node={child}
                        depth={depth + 1}
                        canEdit={canEdit}
                        collapsed={collapsed}
                        onToggle={onToggle}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function ContactsOrgChart({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function zoomBy(delta: number) {
    setZoom((prev) => Math.min(1.5, Math.max(0.5, Math.round((prev + delta) * 100) / 100)));
  }

  function handlePointerDown(e: React.MouseEvent<HTMLDivElement>) {
    const container = scrollRef.current;
    if (!container) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      moved: false,
    };
    setIsPanning(true);

    function handlePointerMove(moveEvent: MouseEvent) {
      const drag = dragRef.current;
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      if (container) {
        container.scrollLeft = drag.scrollLeft - dx;
        container.scrollTop = drag.scrollTop - dy;
      }
    }

    function handlePointerUp() {
      setIsPanning(false);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
  }

  function handleClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current.moved = false;
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 0.1 : -0.1);
  }

  const tree = buildOrgTree<OrgContact>(
    contacts.map((c) => ({ ...c, name: `${c.first_name} ${c.last_name}` })),
  );

  if (tree.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        No hay relaciones de supervisor definidas todavía.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => zoomBy(-0.1)}
          disabled={zoom <= 0.5}
          aria-label="Alejar"
          className="flex size-7 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="w-12 text-center text-xs text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(0.1)}
          disabled={zoom >= 1.5}
          aria-label="Acercar"
          className="flex size-7 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label="Restablecer zoom"
          title="Restablecer zoom"
          className="flex size-7 items-center justify-center rounded-lg border hover:bg-muted"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      <div
        ref={scrollRef}
        onMouseDown={handlePointerDown}
        onClickCapture={handleClickCapture}
        onWheel={handleWheel}
        className={`max-h-[70vh] overflow-auto rounded-lg border pb-4 select-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div
          className="flex min-w-fit flex-col items-center gap-10 px-4 py-6"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
          {tree.map((node) => (
            <OrgBranch
              key={node.contact.id}
              node={node}
              depth={0}
              canEdit={canEdit}
              collapsed={collapsed}
              onToggle={toggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
