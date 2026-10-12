"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "install-banner-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own non-standard flag for "launched from home screen".
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Android/Chrome gets a real "Instalar app" button via beforeinstallprompt.
// iOS Safari has no equivalent API (Apple doesn't expose one) — it gets a
// short instruction instead, since push notifications there only work once
// the app is actually added to the home screen.
export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // One-time sync from browser-only APIs (matchMedia/localStorage/UA) on
    // mount, deferred to an effect (rather than a lazy useState initializer)
    // so server and client render the same initial markup and avoid a
    // hydration mismatch — same pattern already used in Sidebar.tsx.
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    } catch {
      // Ignore — localStorage can throw in some private-browsing contexts.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(false);

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Ignore — the banner just reappears next visit, which is fine.
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#04B1AF]/25 bg-[#04B1AF]/10 px-4 py-2 text-sm">
      {deferredPrompt ? (
        <>
          <span className="text-foreground">Instala la app en tu celular para recibir notificaciones.</span>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" onClick={install}>
              <Download className="size-3.5" />
              Instalar app
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={dismiss}>
              <X className="size-4" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5 text-foreground">
            Para instalar: toca <Share className="size-3.5" /> y luego &quot;Agregar a inicio&quot;.
          </span>
          <Button variant="ghost" size="icon-sm" onClick={dismiss}>
            <X className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}
