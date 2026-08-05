"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [openItem, setOpenItem] = useState<NewsItem | null>(null);

  useEffect(() => {
    setActive((a) => Math.max(0, Math.min(n - 1, a)));
  }, [n]);

  useEffect(() => {
    if (n < 2 || openItem) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % n);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [n, openItem]);

  if (n === 0) return null;

  const item = items[active];

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-4 duration-700">
      <div className="relative min-h-0 flex-1">
        {item.image_url ? (
          <button
            type="button"
            onClick={() => setOpenItem(item)}
            aria-label={`Ver ${item.title}`}
            className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl bg-white"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL */}
            <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpenItem(item)}
            aria-label={`Ver ${item.title}`}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 p-4 text-center text-white"
          >
            <span className="text-lg font-semibold">{item.title}</span>
          </button>
        )}
      </div>
      {n > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
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
      <Dialog open={openItem !== null} onOpenChange={(isOpen) => !isOpen && setOpenItem(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="sr-only">{openItem?.title}</DialogTitle>
          </DialogHeader>
          {openItem && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {openItem.image_url && (
                // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
                <img
                  src={openItem.image_url}
                  alt=""
                  className="max-h-[60vh] w-full shrink-0 rounded-lg object-contain sm:w-1/2"
                />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xl font-semibold">{openItem.title}</p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{openItem.description}</p>
                {openItem.link_url && (
                  <a
                    href={openItem.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm font-medium text-[#04B1AF] underline underline-offset-2"
                  >
                    Más información
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
