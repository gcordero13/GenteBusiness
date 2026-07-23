"use client";

import { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { StampPickerDialog } from "./StampPickerDialog";
import { TextItemDialog, type TextItemResult } from "./TextItemDialog";
import { SignatureDialog } from "./SignatureDialog";
import {
  clampPosition,
  computeInitialSignatureSize,
  computeInitialStampSize,
  computePdfDrawRect,
} from "@/lib/pdfStamping";
import type { SealWithUrl, SignatureWithUrl } from "./page";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";

interface PageItem {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function PdfStamperTool({
  seals,
  signatures,
}: {
  seals: SealWithUrl[];
  signatures: SignatureWithUrl[];
}) {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });
  const [items, setItems] = useState<Record<number, PageItem[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Arrastra un PDF o ábrelo con el botón");
  const [nextId, setNextId] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);

  async function renderPage(doc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<boolean> {
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current;
      if (!canvas) return false;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setOverlaySize({ width: viewport.width, height: viewport.height });
      await page.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport }).promise;
      return true;
    } catch (err) {
      console.error(err);
      setStatus("No se pudo mostrar la página.");
      return false;
    }
  }

  async function loadFile(file: File) {
    setStatus("Cargando PDF...");
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // pdfjs transfers (detaches) the buffer of the array it's handed off to its
      // worker, so it must get its own copy — otherwise `bytes` goes empty and
      // pdf-lib fails later with "No PDF header found" when downloading.
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      setPdfBytes(bytes);
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      setItems({});
      setSelectedId(null);
      const renderedOk = await renderPage(doc, 1);
      if (renderedOk) {
        setStatus(`PDF cargado: ${file.name}`);
      }
    } catch (err) {
      console.error(err);
      setPdfBytes(null);
      setPdfDoc(null);
      setTotalPages(0);
      setStatus("No se pudo cargar el PDF. Verifica que el archivo no esté dañado.");
    }
  }

  async function goToPage(pageNum: number) {
    if (!pdfDoc || pageNum < 1 || pageNum > totalPages) return;
    setCurrentPage(pageNum);
    await renderPage(pdfDoc, pageNum);
  }

  function addItem(item: PageItem) {
    setItems((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] ?? []), item],
    }));
    setSelectedId(item.id);
  }

  async function handlePickStamp(seal: SealWithUrl) {
    const img = await loadImage(seal.url);
    const { w, h } = computeInitialStampSize(img.naturalWidth, img.naturalHeight, overlaySize.width);
    addItem({
      id: `item_${nextId}`,
      dataUrl: seal.url,
      x: (overlaySize.width - w) / 2,
      y: (overlaySize.height - h) / 2,
      w,
      h,
    });
    setNextId((n) => n + 1);
    setStatus("Sello añadido. Arrástralo a la posición deseada.");
  }

  async function handlePickSignature(dataUrl: string) {
    const img = await loadImage(dataUrl);
    const { w, h } = computeInitialSignatureSize(
      img.naturalWidth,
      img.naturalHeight,
      overlaySize.width,
      overlaySize.height,
    );
    addItem({
      id: `item_${nextId}`,
      dataUrl,
      x: (overlaySize.width - w) / 2,
      y: (overlaySize.height - h) / 2,
      w,
      h,
    });
    setNextId((n) => n + 1);
    setStatus("Firma añadida. Arrástrala a la posición deseada.");
  }

  function handleAddText({ dataUrl, width, height }: TextItemResult) {
    const maxW = overlaySize.width * 0.5;
    const w = Math.min(width, maxW);
    const h = height * (w / width);
    addItem({
      id: `item_${nextId}`,
      dataUrl,
      x: (overlaySize.width - w) / 2,
      y: (overlaySize.height - h) / 3,
      w,
      h,
    });
    setNextId((n) => n + 1);
    setStatus("Texto añadido.");
  }

  function deleteSelected() {
    if (!selectedId) return;
    setItems((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] ?? []).filter((i) => i.id !== selectedId),
    }));
    setSelectedId(null);
  }

  function onItemMouseDown(e: React.MouseEvent, item: PageItem) {
    e.preventDefault();
    setSelectedId(item.id);
    dragRef.current = { id: item.id, startX: e.clientX, startY: e.clientY, origX: item.x, origY: item.y };
  }

  function onResizeMouseDown(e: React.MouseEvent, item: PageItem) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { id: item.id, startX: e.clientX, startY: e.clientY, origW: item.w, origH: item.h };
  }

  function onOverlayMouseMove(e: React.MouseEvent) {
    if (dragRef.current) {
      const { id, startX, startY, origX, origY } = dragRef.current;
      const pageItems = items[currentPage] ?? [];
      const item = pageItems.find((i) => i.id === id);
      if (!item) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const { x, y } = clampPosition(
        origX + dx,
        origY + dy,
        item.w,
        item.h,
        overlaySize.width,
        overlaySize.height,
      );
      setItems((prev) => ({
        ...prev,
        [currentPage]: (prev[currentPage] ?? []).map((i) => (i.id === id ? { ...i, x, y } : i)),
      }));
    }
    if (resizeRef.current) {
      const { id, startX, startY, origW, origH } = resizeRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const w = Math.max(20, origW + dx);
      const h = Math.max(20, origH + dy);
      setItems((prev) => ({
        ...prev,
        [currentPage]: (prev[currentPage] ?? []).map((i) => (i.id === id ? { ...i, w, h } : i)),
      }));
    }
  }

  function onOverlayMouseUp() {
    dragRef.current = null;
    resizeRef.current = null;
  }

  async function downloadPdf() {
    if (!pdfBytes) return;
    const hasItems = Object.values(items).some((pageItems) => pageItems.length > 0);
    if (!hasItems) {
      setStatus("No hay elementos para guardar");
      return;
    }

    setStatus("Generando PDF...");
    try {
      const doc = await PDFDocument.load(pdfBytes);

      for (const [pageNumStr, pageItems] of Object.entries(items)) {
        if (pageItems.length === 0) continue;
        const pageNum = parseInt(pageNumStr, 10);
        const page = doc.getPage(pageNum - 1);
        const pageSize = page.getSize();

        for (const item of pageItems) {
          const response = await fetch(item.dataUrl);
          const bytes = new Uint8Array(await response.arrayBuffer());
          const embedded = await doc.embedPng(bytes);
          const rect = computePdfDrawRect(
            item,
            overlaySize.width,
            overlaySize.height,
            pageSize.width,
            pageSize.height,
          );
          page.drawImage(embedded, rect);
        }
      }

      const savedBytes = await doc.save();
      const blob = new Blob([new Uint8Array(savedBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "documento_sellado.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("PDF descargado.");
    } catch (err) {
      console.error(err);
      setStatus(`Error al generar el PDF: ${err instanceof Error ? err.message : "intenta de nuevo"}`);
    }
  }

  const currentItems = items[currentPage] ?? [];

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          Abrir PDF
        </Button>
        <StampPickerDialog seals={seals} onPick={handlePickStamp} />
        <TextItemDialog onAdd={handleAddText} />
        <SignatureDialog signatures={signatures} onPick={handlePickSignature} />
        <Button variant="outline" onClick={deleteSelected} disabled={!selectedId}>
          Eliminar elemento
        </Button>
        <Button onClick={downloadPdf} disabled={!pdfDoc}>
          Descargar
        </Button>
      </div>

      {pdfDoc && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            Anterior
          </Button>
          <span>
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Siguiente
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{status}</p>

      <div
        className="relative inline-block"
        onMouseMove={onOverlayMouseMove}
        onMouseUp={onOverlayMouseUp}
        onMouseLeave={onOverlayMouseUp}
      >
        <canvas ref={canvasRef} className="border" />
        {currentItems.map((item) => (
          <div
            key={item.id}
            className={`absolute border ${item.id === selectedId ? "border-2 border-[#04B1AF]" : "border-transparent"}`}
            style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
            onMouseDown={(e) => onItemMouseDown(e, item)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL / signed URL overlay item, not a static asset */}
            <img src={item.dataUrl} alt="" className="h-full w-full object-contain" draggable={false} />
            <div
              className="absolute -right-1 -bottom-1 h-3 w-3 cursor-se-resize bg-[#04B1AF]"
              onMouseDown={(e) => onResizeMouseDown(e, item)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
