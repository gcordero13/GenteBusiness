"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, type BirthdayContact } from "@/lib/contacts";
import { BirthdayContactModal } from "./BirthdayContactModal";

const AUTOPLAY_MS = 4 * 1000;
const CONFETTI_COLORS = ["#ffffff", "#fde68a", "#fca5a5", "#93c5fd", "#c4b5fd", "#fbcfe8"];
const CONFETTI_COUNT = 24;

interface ConfettiPiece {
  left: number;
  color: string;
  delay: number;
  duration: number;
}

// A tiny deterministic hash instead of Math.random(): same input always
// produces the same output, so the server-rendered HTML and the client's
// first render agree exactly and React never reports a hydration mismatch.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const CONFETTI_PIECES: ConfettiPiece[] = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  left: pseudoRandom(i) * 100,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: pseudoRandom(i + 100) * 2,
  duration: 1.8 + pseudoRandom(i + 200) * 1.4,
}));

export function TodayBirthdayCard({ contacts }: { contacts: BirthdayContact[] }) {
  const n = contacts.length;
  const [active, setActive] = useState(0);

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

  const contact = contacts[active];

  return (
    <div className="relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 px-8 py-6 text-center shadow-md md:aspect-auto md:h-full">
      {CONFETTI_PIECES.map((piece, i) => (
        <span
          key={i}
          aria-hidden
          suppressHydrationWarning
          className="animate-confetti-fall absolute top-[-10%] h-3.5 w-2 opacity-90"
          style={{
            left: `${piece.left.toFixed(2)}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay.toFixed(3)}s`,
            animationDuration: `${piece.duration.toFixed(3)}s`,
          }}
        />
      ))}
      <BirthdayContactModal
        contact={contact}
        trigger={
          <button type="button" className="relative z-10 flex w-full flex-col items-center gap-1 text-left">
            <Avatar className="size-52 border-4 border-white shadow-lg">
              <AvatarImage src={contact.photo_url ?? undefined} alt="" />
              <AvatarFallback className="bg-white text-6xl text-black">
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>
            <span className="mt-2 max-w-[320px] text-2xl font-bold text-black">{contact.name}</span>
            {contact.position && <span className="text-lg text-gray-800">{contact.position}</span>}
            <span className="mt-1 animate-bounce rounded-full border border-white/50 bg-white/20 px-5 py-2 text-base font-bold text-white">
              🎉 ¡Hoy cumple años!
            </span>
          </button>
        }
      />
      {n > 1 && (
        <div className="relative z-10 mt-3 flex justify-center gap-1.5">
          {contacts.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Ver a ${c.name}`}
              onClick={() => setActive(i)}
              className={`size-1.5 rounded-full transition-colors ${
                i === active ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
