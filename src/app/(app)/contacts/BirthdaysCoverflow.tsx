"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMonthDay, getInitials, isTodayBirthday, type BirthdayContact } from "@/lib/contacts";

const PERSPECTIVE = 1000;
const SCALE_STEP = 0.22;
const MAX_VISIBLE = 2;
const DEPTH = 90;
const STEP_X = 82;
const TILT = 10;
const AUTOPLAY_MS = 3 * 1000;
const TRANSITION =
  "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), filter 0.6s ease";

export function BirthdaysCoverflow({ contacts }: { contacts: BirthdayContact[] }) {
  const n = contacts.length;
  const [active, setActive] = useState(0);
  const prevActiveRef = useRef(active);

  useEffect(() => {
    prevActiveRef.current = active;
  }, [active]);

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
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex h-64 w-full items-center justify-center"
        style={{ perspective: `${PERSPECTIVE}px` }}
      >
        <div className="relative size-full" style={{ transformStyle: "preserve-3d" }}>
          {contacts.map((c, i) => {
            let rel = i - active;
            if (rel > n / 2) rel -= n;
            if (rel < -n / 2) rel += n;
            const ax = Math.abs(rel);
            const visible = ax <= MAX_VISIBLE;
            const isActive = rel === 0;
            const scale = Math.max(0.5, 1 - ax * SCALE_STEP);
            const tx = rel * STEP_X;
            const ty = ax === 1 ? -24 : 0;
            const tz = -ax * DEPTH;
            const ry = -rel * TILT;
            const today = isTodayBirthday(c.birth_date);

            let prevRel = i - prevActiveRef.current;
            if (prevRel > n / 2) prevRel -= n;
            if (prevRel < -n / 2) prevRel += n;
            const justWrapped = Math.abs(rel - prevRel) > 1;

            return (
              <Link
                key={c.id}
                href={`/contacts/${c.id}`}
                aria-label={c.name}
                aria-hidden={!visible}
                tabIndex={visible ? 0 : -1}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translateX(${tx}px) translateY(${ty}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
                  filter: justWrapped ? "blur(6px)" : "blur(0px)",
                  transition: TRANSITION,
                  opacity: visible ? 1 : 0,
                  pointerEvents: visible ? "auto" : "none",
                }}
                className="flex flex-col items-center gap-1"
              >
                <Avatar
                  className={`size-36 shadow-md ${isActive ? "border-2 border-[#04B1AF]" : ""}`}
                >
                  <AvatarImage src={c.photo_url ?? undefined} alt="" />
                  <AvatarFallback className="text-3xl">{getInitials(c.name)}</AvatarFallback>
                </Avatar>
                {isActive && (
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <span className="max-w-[220px] text-center text-lg font-semibold">{c.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {c.birth_date ? formatMonthDay(c.birth_date) : ""}
                    </span>
                    {today && (
                      <span className="animate-pulse rounded-full bg-[#04B1AF] px-2 py-0.5 text-xs font-medium text-white">
                        ¡Hoy!
                      </span>
                    )}
                  </div>
                )}
              </Link>
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
