"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listGoservicesComments, addGoservicesComment, type GoservicesCommentRow } from "./actions";

export function GoservicesCommentThread({
  requestId,
  canComment,
}: {
  requestId: string;
  canComment: boolean;
}) {
  const [comments, setComments] = useState<GoservicesCommentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refetch() {
    const rows = await listGoservicesComments(requestId);
    setComments(rows);
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listGoservicesComments(requestId).then((rows) => {
      if (!cancelled) {
        setComments(rows);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await addGoservicesComment(requestId, body);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBody("");
      await refetch();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <MessageSquare className="size-3.5" />
        Comentarios
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando comentarios…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin comentarios todavía.</p>
      ) : (
        <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border border-border/60 bg-background/60 p-3">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                {comment.authorEmail}{" "}
                <span className="font-normal text-muted-foreground">· {comment.createdAtLabel}</span>
              </p>
              <p className="text-sm whitespace-pre-wrap text-foreground/90">{comment.body}</p>
            </div>
          ))}
        </div>
      )}

      {canComment && (
        <div className="space-y-1.5">
          <textarea
            className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe un comentario…"
            rows={2}
            disabled={isPending}
          />
          <div className="flex items-center justify-end gap-2">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button
              type="button"
              size="sm"
              disabled={isPending || !body.trim()}
              className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
              onClick={onSubmit}
            >
              Comentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
