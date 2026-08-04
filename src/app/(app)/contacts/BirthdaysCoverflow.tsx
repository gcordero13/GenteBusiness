"use client";

import { useEffect, useState } from "react";
import { BirthdayContactModal } from "./BirthdayContactModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMonthDay, getInitials, isTodayBirthday, type BirthdayContact } from "@/lib/contacts";

const GEOMETRY = {
  full: { perspective: 1100, scaleStep: 0.22, maxVisible: 2, depth: 100, stepX: 92, tilt: 10, height: "h-64", avatar: "size-40", avatarText: "text-4xl", nameGap: "mt-2" },
  compact: { perspective: 800, scaleStep: 0.22, maxVisible: 1, depth: 70, stepX: 80, tilt: 10, height: "h-56", avatar: "size-32", avatarText: "text-3xl", nameGap: "mt-3" },
};
const AUTOPLAY_MS = 3 * 1000;
const TRANSITION =
  "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), filter 0.6s ease";

export function BirthdaysCoverflow({
  contacts,
  compact = false,
}: {
  contacts: BirthdayContact[];
  compact?: boolean;
}) {
  const n = contacts.length;
  const [active, setActive] = useState(0);
  const g = compact ? GEOMETRY.compact : GEOMETRY.full;

  useEffect(() => {
    setActive((a) => Math.max(0, Math.min(n - 1, a)));
  }, [n]);

  useEffect(() => {
    if (n < 2) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % n);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [n]);

  if (n === 0) return null;

  return (
    <div className="mt-2 flex flex-col items-center gap-2">
      <div
        className={`relative flex ${g.height} w-full items-center justify-center`}
        style={{ perspective: `${g.perspective}px` }}
      >
        <div className="relative size-full" style={{ transformStyle: "preserve-3d" }}>
          {contacts.map((c, i) => {
            let rel = i - active;
            if (rel > n / 2) rel -= n;
            if (rel < -n / 2) rel += n;
            const ax = Math.abs(rel);
            const visible = ax <= g.maxVisible;
            const isActive = rel === 0;
            const scale = Math.max(0.5, 1 - ax * g.scaleStep);
            const tx = rel * g.stepX;
            const ty = ax === 1 ? (compact ? -22 : -8) : 0;
            const tz = -ax * g.depth;
            const ry = -rel * g.tilt;
            const today = isTodayBirthday(c.birth_date);
            const aboutToWrap = rel === -g.maxVisible;

            return (
              <BirthdayContactModal
                key={c.id}
                contact={c}
                trigger={
                  <button
                    type="button"
                    aria-label={c.name}
                    aria-hidden={!visible}
                    tabIndex={visible ? 0 : -1}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: `translate(-50%, -50%) translateX(${tx}px) translateY(${ty}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
                      filter: aboutToWrap ? "blur(6px)" : "blur(0px)",
                      transition: TRANSITION,
                      opacity: visible ? 1 : 0,
                      pointerEvents: visible ? "auto" : "none",
                    }}
                    className="flex flex-col items-center gap-1 text-left"
                  >
                    <Avatar
                      className={`${g.avatar} shadow-md ${isActive ? "border-2 border-[#04B1AF]" : ""}`}
                    >
                      <AvatarImage src={c.photo_url ?? undefined} alt="" />
                      <AvatarFallback className={g.avatarText}>{getInitials(c.name)}</AvatarFallback>
                    </Avatar>
                    {isActive && (
                      <div className={`${g.nameGap} flex flex-col items-center gap-1`}>
                        <span className={compact ? "max-w-[200px] text-center text-base font-semibold" : "max-w-[260px] text-center text-xl font-semibold"}>
                          {c.name}
                        </span>
                        <span className={compact ? "text-sm text-muted-foreground" : "text-base text-muted-foreground"}>
                          {c.birth_date ? formatMonthDay(c.birth_date) : ""}
                        </span>
                        {today && (
                          <span className="animate-pulse rounded-full bg-[#04B1AF] px-2 py-0.5 text-xs font-medium text-white">
                            ¡Hoy!
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                }
              />
            );
          })}
        </div>
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-1.5">
          {contacts.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Ver a ${c.name}`}
              onClick={() => setActive(i)}
              className={`size-1.5 rounded-full transition-colors ${
                i === active ? "bg-[#04B1AF]" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
