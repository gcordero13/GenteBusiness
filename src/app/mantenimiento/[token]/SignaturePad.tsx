"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveMaintenanceSignature } from "./actions";

export function SignaturePad({
  token,
  role,
  label,
  alreadySigned,
}: {
  token: string;
  role: "technician" | "user";
  label: string;
  alreadySigned: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointCountRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(alreadySigned);
  const [isPending, startTransition] = useTransition();

  function getPos(canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function onDown(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const p = getPos(canvas, e);
    drawingRef.current = true;
    pointCountRef.current = 1;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const p = getPos(canvas, e);
    pointCountRef.current += 1;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function onUp() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    pointCountRef.current = 0;
  }

  function submit() {
    const canvas = canvasRef.current;
    if (!canvas || pointCountRef.current < 3) {
      setError("Dibuja tu firma antes de continuar");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    startTransition(async () => {
      const result = await saveMaintenanceSignature(token, role, dataUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
    });
  }

  if (saved) {
    return <p className="text-sm text-green-700">{label}: firmado ✓</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        className="w-full rounded border bg-white"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Borrar
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={isPending}>
          Guardar firma
        </Button>
      </div>
    </div>
  );
}
