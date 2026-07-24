"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1">
      <Label htmlFor="password" className="text-zinc-600">
        Clave
      </Label>
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
        <Input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          required
          className="border-zinc-200 bg-white pr-9 pl-8 text-zinc-900 placeholder:text-zinc-400 focus-visible:border-[#04B1AF] focus-visible:ring-[#04B1AF]/30"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-700"
          title={visible ? "Ocultar clave" : "Mostrar clave"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
