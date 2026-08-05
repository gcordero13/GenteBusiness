"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { sanitizeFileName } from "@/lib/storagePath";
import { saveNews } from "./actions";

interface NewsInput {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string | null;
  startDate: string;
  endDate: string;
}

export function NewsForm({ initial }: { initial?: NewsInput }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dateRangeValid = !startDate || !endDate || endDate >= startDate;

  function submit() {
    startTransition(async () => {
      let finalImageUrl = imageUrl;

      if (imageFile) {
        const supabase = createBrowserClient();
        const path = `${crypto.randomUUID()}-${sanitizeFileName(imageFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("news-images")
          .upload(path, imageFile);
        if (uploadError) {
          setError(uploadError.message);
          return;
        }
        const { data } = supabase.storage.from("news-images").getPublicUrl(path);
        finalImageUrl = data.publicUrl;
      }

      const result = await saveNews(initial?.id, {
        title,
        description,
        imageUrl: finalImageUrl,
        linkUrl: linkUrl || null,
        startDate,
        endDate,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!initial) {
        setTitle("");
        setDescription("");
        setImageUrl(null);
        setImageFile(null);
        setLinkUrl("");
        setStartDate("");
        setEndDate("");
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nueva noticia</Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar noticia o evento" : "Nueva noticia o evento"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Título</Label>
          <Input
            placeholder="Ej. Mes de la concientización del cáncer de mama"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Descripción</Label>
          <textarea
            className="w-full rounded-md border p-2 text-sm"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Imagen (opcional)</Label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
          {imageUrl && !imageFile && (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img src={imageUrl} alt="" className="mt-2 h-16 w-28 rounded object-cover" />
          )}
        </div>
        <div className="space-y-1">
          <Label>Enlace (opcional)</Label>
          <Input
            type="url"
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        {!dateRangeValid && (
          <p className="text-sm text-red-600">La fecha &quot;hasta&quot; no puede ser anterior a &quot;desde&quot;.</p>
        )}
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={isPending || !title || !description || !startDate || !endDate || !dateRangeValid}
          >
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
