"use client";

import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  link_url: string | null;
}

const AUTOPLAY_MS = 6 * 1000;

export function NewsWidget({ items }: { items: NewsItem[] }) {
  const n = items.length;
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

  const item = items[active];

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-6 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
          <img
            src={item.image_url}
            alt=""
            className="h-32 w-full shrink-0 rounded-xl object-cover sm:h-24 sm:w-40"
          />
        ) : (
          <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white sm:w-40">
            <Newspaper className="size-8" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-lg font-semibold">{item.title}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          {item.link_url && (
            <a
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium text-[#04B1AF] underline underline-offset-2"
            >
              Más información
            </a>
          )}
        </div>
      </div>
      {n > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              aria-label={`Ver ${it.title}`}
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
