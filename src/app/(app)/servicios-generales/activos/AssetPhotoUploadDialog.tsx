"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateMaintenanceAssetPhoto, type MaintenanceAssetRow } from "../actions";

export function AssetPhotoUploadDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: MaintenanceAssetRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!asset) return null;

  const existingPhotoUrl =
    asset.photoDriveId && asset.photoItemId
      ? `/api/servicios-generales/asset-photo/${asset.photoDriveId}/${asset.photoItemId}`
      : null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    setPhotoFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function submit() {
    if (!asset) return;
    if (!photoFile) {
      setError("Selecciona una foto primero.");
      return;
    }
    setIsPending(true);
    setError(null);
    const result = await updateMaintenanceAssetPhoto(asset.id, photoFile);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPhotoFile(null);
    setPreviewUrl(null);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setPhotoFile(null);
          setPreviewUrl(null);
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Foto de {asset.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-28 items-center justify-center overflow-hidden rounded-xl border bg-muted">
            {previewUrl || existingPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl ?? existingPhotoUrl ?? undefined} alt="" className="size-full object-cover" />
            ) : (
              <ImageOff className="size-6 text-muted-foreground" />
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !photoFile}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
