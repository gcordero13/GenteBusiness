"use client";

import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";

export function AppShell({
  children,
  ...sidebarProps
}: React.ComponentProps<typeof Sidebar> & { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
      </div>
      <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <header className="flex items-center justify-between gap-2 border-b p-3 md:hidden">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <span className="font-semibold">Gente Sánchez Business</span>
          </div>
          <form action={sidebarProps.onLogout}>
            <Button type="submit" variant="ghost" size="icon-sm" title="Cerrar sesión">
              <LogOut className="size-5" />
            </Button>
          </form>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
