"use client";

import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"];

function getExtension(url: string): string {
  // The signed URL's real path (and extension) comes before the query
  // string (?token=...), e.g. ".../object/sign/.../abc-comprobante.pdf?token=...".
  const withoutQuery = url.split("?")[0];
  const lastDot = withoutQuery.lastIndexOf(".");
  return lastDot === -1 ? "" : withoutQuery.slice(lastDot + 1).toLowerCase();
}

export function AttachmentViewerDialog({ url }: { url: string }) {
  const extension = getExtension(url);
  const isImage = IMAGE_EXTENSIONS.includes(extension);
  const isPdf = extension === "pdf";

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100"
          />
        }
      >
        <Paperclip className="size-4" aria-hidden="true" />
        Ver documento adjunto
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Documento adjunto</DialogTitle>
        </DialogHeader>
        {isImage ? (
          <img src={url} alt="Documento adjunto" className="max-h-[75vh] w-full object-contain" />
        ) : isPdf ? (
          <iframe src={url} title="Documento adjunto" className="h-[75vh] w-full rounded-md border" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Este tipo de archivo no se puede previsualizar.{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-teal-800 underline">
              Ábrelo en una pestaña nueva
            </a>
            .
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
