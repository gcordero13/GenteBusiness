"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteSignature, saveSignature } from "./actions";
import type { SignatureWithUrl } from "./page";

export function SignatureDialog({
  signatures,
  onPick,
}: {
  signatures: SignatureWithUrl[];
  onPick: (dataUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(2);
  const [isPending, startTransition] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointCountRef = useRef(0);

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
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
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

  function acceptDrawn() {
    const canvas = canvasRef.current;
    if (!canvas || pointCountRef.current < 3) return;
    const dataUrl = canvas.toDataURL("image/png");
    startTransition(async () => {
      await saveSignature(dataUrl);
      onPick(dataUrl);
      setOpen(false);
      clear();
    });
  }

  function pickSaved(url: string) {
    onPick(url);
    setOpen(false);
  }

  function removeSaved(id: string, storagePath: string) {
    startTransition(async () => {
      await deleteSignature(id, storagePath);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Firma</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Firma</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <canvas
            ref={canvasRef}
            width={440}
            height={160}
            className="w-full rounded border bg-white"
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            onTouchStart={onDown}
            onTouchMove={onMove}
            onTouchEnd={onUp}
          />
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              Grosor
              <input
                type="range"
                min={1}
                max={6}
                value={lineWidth}
                onChange={(e) => setLineWidth(parseFloat(e.target.value))}
              />
            </label>
            <Button variant="outline" size="sm" onClick={clear}>
              Borrar
            </Button>
          </div>
          {signatures.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Firmas guardadas</p>
              <div className="flex flex-wrap gap-2">
                {signatures.map((sig) => (
                  <div key={sig.id} className="relative rounded border p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL */}
                    <img
                      src={sig.url}
                      alt="Firma guardada"
                      className="h-12 cursor-pointer object-contain"
                      onClick={() => pickSaved(sig.url)}
                    />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-xs text-white"
                      onClick={() => removeSaved(sig.id, sig.storagePath)}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={acceptDrawn} disabled={isPending}>
            Usar firma dibujada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
