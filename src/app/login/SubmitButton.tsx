"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full bg-[#04B1AF] text-white transition-all duration-200 hover:scale-[1.02] hover:bg-[#039e9c] hover:shadow-lg hover:shadow-[#04B1AF]/25 active:scale-[0.98]"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Entrando...
        </>
      ) : (
        "Entrar"
      )}
    </Button>
  );
}
