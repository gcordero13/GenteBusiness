"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImageOff, Plus } from "lucide-react";
import { createSupplyArticle, updateSupplyArticle, type SupplyArticleInput, type SupplyArticleRow } from "./actions";

const EMPTY: SupplyArticleInput = {
  name: "",
  code: "",
  category: "",
  unit: "",
  price: 0,
  stockQuantity: 0,
  lowStockThreshold: 0,
  imageUrl: "",
};

// Images are captured as a link, never uploaded — confirmed with the user
// ("quiero poder ponerle un link de la imagen para no cargar la imagen
// como tal del producto").
export function ArticleFormDialog({ article }: { article?: SupplyArticleRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplyArticleInput>(
    article
      ? {
          name: article.name,
          code: article.code,
          category: article.category ?? "",
          unit: article.unit,
          price: article.price,
          stockQuantity: article.stockQuantity,
          lowStockThreshold: article.lowStockThreshold,
          imageUrl: article.imageUrl ?? "",
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = article ? await updateSupplyArticle(article.id, form) : await createSupplyArticle(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (!article) setForm(EMPTY);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          article ? (
            <Button variant="outline" size="sm" />
          ) : (
            <Button className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />
          )
        }
      >
        {article ? (
          "Editar"
        ) : (
          <>
            <Plus className="size-4" />
            Nuevo artículo
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{article ? `Editar ${article.name}` : "Nuevo artículo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Input
            placeholder="Nombre del artículo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Código (ej. P-011)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              placeholder="Unidad (ej. Caja)"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>
          <Input
            placeholder="Categoría (ej. Papelería)"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              type="number"
              step="0.01"
              placeholder="Precio"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="Stock inicial"
              value={form.stockQuantity}
              onChange={(e) => setForm({ ...form, stockQuantity: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="Alerta en"
              value={form.lowStockThreshold}
              onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
            />
          </div>

          <label className="block text-xs font-semibold text-muted-foreground">
            Imagen del artículo (link, sin subir archivo)
          </label>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {form.imageUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="Vista previa" className="size-full object-cover" />
              ) : (
                <ImageOff className="size-4 text-muted-foreground" />
              )}
            </div>
            <Input
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar artículo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
