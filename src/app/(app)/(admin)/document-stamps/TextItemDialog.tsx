"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TextItemResult {
  dataUrl: string;
  width: number;
  height: number;
}

function renderTextToDataUrl(
  text: string,
  fontSize: number,
  color: string,
  bold: boolean,
  italic: boolean,
  underline: boolean,
): { dataUrl: string; width: number; height: number } {
  const dpr = 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  let fontStyle = "";
  if (italic) fontStyle += "italic ";
  if (bold) fontStyle += "bold ";
  const font = `${fontStyle}${fontSize * dpr}px Arial, sans-serif`;
  ctx.font = font;

  const lines = text.split("\n");
  let maxW = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxW) maxW = m.width;
  }

  const lineH = fontSize * dpr * 1.3;
  const pad = fontSize * dpr * 0.3;
  const ulHeight = underline ? Math.max(3, Math.round(fontSize * dpr * 0.08)) : 0;
  const extraH = underline ? ulHeight * 2 : 0;
  const cw = Math.ceil(maxW + pad * 2);
  const ch = Math.ceil(lines.length * lineH + pad * 2 + extraH);
  canvas.width = cw;
  canvas.height = ch;

  ctx.scale(dpr, dpr);
  ctx.font = `${fontStyle}${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";

  for (let j = 0; j < lines.length; j++) {
    ctx.fillText(lines[j], pad / dpr, (pad + j * lineH) / dpr);
    if (underline) {
      const yPos = (pad + (j + 1) * lineH - lineH * 0.15 + ulHeight) / dpr;
      const m = ctx.measureText(lines[j]);
      ctx.fillRect(pad / dpr, yPos, m.width, ulHeight / dpr);
    }
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: cw / dpr, height: ch / dpr };
}

export function TextItemDialog({ onAdd }: { onAdd: (result: TextItemResult) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(28);
  const [color, setColor] = useState("#000000");
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  function accept() {
    if (!text.trim()) return;
    const { dataUrl, width, height } = renderTextToDataUrl(text, fontSize, color, bold, italic, underline);
    onAdd({ dataUrl, width, height });
    setText("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Texto</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escriba el texto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="text-content">Texto</Label>
            <textarea
              id="text-content"
              className="w-full rounded border p-2 text-sm"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="text-size">Tamaño</Label>
              <Input
                id="text-size"
                type="number"
                min={8}
                max={200}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10) || 28)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="text-color">Color</Label>
              <Input
                id="text-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />
              Negrita
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />
              Cursiva
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={underline}
                onChange={(e) => setUnderline(e.target.checked)}
              />
              Subrayado
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={accept} disabled={!text.trim()}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
