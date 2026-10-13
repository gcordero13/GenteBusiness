"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Minus, Plus, Search, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupplyArticleRow } from "./articulos/actions";
import { createSupplyRequest, type ApproverOption } from "./actions";

interface CartItem {
  articleId: string;
  name: string;
  unit: string;
  icon: string;
  qty: number;
}

const ALL_CATEGORY = "__todas__";

export function SupplyRequestForm({
  articles,
  approvers,
}: {
  articles: SupplyArticleRow[];
  approvers: ApproverOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [qtyByArticle, setQtyByArticle] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [approverId, setApproverId] = useState(approvers[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(() => {
    const unique = Array.from(new Set(articles.map((a) => a.category).filter((c): c is string => Boolean(c))));
    return unique.sort();
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      const matchesQuery = !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
      const matchesCategory = category === ALL_CATEGORY || a.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [articles, query, category]);

  function qtyFor(articleId: string): number {
    return qtyByArticle[articleId] ?? 1;
  }

  function changeQty(articleId: string, delta: number) {
    setQtyByArticle((prev) => ({ ...prev, [articleId]: Math.max(1, (prev[articleId] ?? 1) + delta) }));
  }

  function addToCart(article: SupplyArticleRow) {
    const qty = qtyFor(article.id);
    setCart((prev) => {
      const existing = prev.find((c) => c.articleId === article.id);
      if (existing) {
        return prev.map((c) => (c.articleId === article.id ? { ...c, qty: c.qty + qty } : c));
      }
      return [...prev, { articleId: article.id, name: article.name, unit: article.unit, icon: "📦", qty }];
    });
  }

  function removeFromCart(articleId: string) {
    setCart((prev) => prev.filter((c) => c.articleId !== articleId));
  }

  const selectedApprover = approvers.find((a) => a.id === approverId) ?? null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createSupplyRequest({
        items: cart.map((c) => ({ articleId: c.articleId, qty: c.qty })),
        approverAppUserId: approverId,
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCart([]);
      setNotes("");
      setReviewOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-5">
      {/* catalog */}
      <div className="min-w-0 flex-[999_1_560px] rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Catálogo de suministros</h2>
          <p className="text-xs text-muted-foreground">No se muestran precios — solo Suministros los administra</p>
        </div>

        <div className="relative mb-3">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar producto por nombre o código..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(ALL_CATEGORY)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              category === ALL_CATEGORY
                ? "border-[#04B1AF] bg-[#04B1AF] text-white"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                category === c
                  ? "border-[#04B1AF] bg-[#04B1AF] text-white"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {filteredArticles.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No hay artículos que coincidan.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredArticles.map((a) => (
              <div key={a.id} className="flex flex-col gap-2.5 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.unit} · {a.code}
                  </p>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-3">
                  {/* column 1: image */}
                  <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {a.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.imageUrl} alt={a.name} className="size-full object-contain p-2" />
                    ) : (
                      <ImageOff className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  {/* column 2: qty stepper on top, Agregar below */}
                  <div className="flex flex-col justify-center gap-2">
                    <div className="flex items-center justify-center gap-2 rounded-md border px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => changeQty(a.id, -1)}
                        className="flex size-5 items-center justify-center rounded bg-muted"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="min-w-[1.2rem] text-center text-xs font-semibold">{qtyFor(a.id)}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(a.id, 1)}
                        className="flex size-5 items-center justify-center rounded bg-muted"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
                      onClick={() => addToCart(a)}
                    >
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* cart */}
      <div className="sticky top-5 flex max-h-[calc(100vh-40px)] min-w-[270px] flex-1 flex-col gap-4 self-start overflow-y-auto">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Mi solicitud actual</h3>

          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Agrega artículos del catálogo para iniciar tu solicitud.
            </p>
          ) : (
            <div className="h-[210px] overflow-y-auto pr-1">
              <div className="flex flex-col gap-2.5">
                {cart.map((item) => (
                  <div key={item.articleId} className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.unit}</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">×{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.articleId)}
                      aria-label={`Quitar ${item.name}`}
                      className="flex size-6 items-center justify-center rounded-md bg-red-50 text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">
              ¿Quién aprueba? (según el organigrama)
            </label>
            {approvers.length === 0 ? (
              <p className="text-xs text-amber-700">
                No tienes un supervisor configurado en Agenda de Contactos — pide que te asignen uno antes de enviar.
              </p>
            ) : (
              <Select value={approverId} onValueChange={(v) => v && setApproverId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => selectedApprover?.name ?? "Selecciona"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {approvers.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="mt-2 space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Observaciones (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>

          <Button
            onClick={() => cart.length > 0 && setReviewOpen(true)}
            disabled={cart.length === 0 || approvers.length === 0}
            className="mt-3 w-full gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
          >
            <Send className="size-4" />
            Revisar y enviar para aprobación
          </Button>
          {selectedApprover && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Se enviará a {selectedApprover.name} y luego pasa a despacho.
            </p>
          )}
        </div>
      </div>

      {/* review modal */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revisa tu solicitud</DialogTitle>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Verifica los artículos y cantidades antes de enviarla. No podrás agregar más hasta el próximo mes, salvo
            una excepción autorizada.
          </p>
          <div className="space-y-2.5 rounded-xl border p-3">
            {cart.map((item) => (
              <div key={item.articleId} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                </div>
                <span className="font-semibold text-[#04908F]">×{item.qty}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aprobador</span>
              <span className="font-medium text-foreground">{selectedApprover?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">Observaciones</span>
              <span className="text-right font-medium text-foreground">{notes.trim() || "—"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={isPending} className="flex-1">
              Volver a editar
            </Button>
            <Button onClick={submit} disabled={isPending} className="flex-1 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
              Confirmar y enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
