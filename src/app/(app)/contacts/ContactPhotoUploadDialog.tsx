"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { sanitizeFileName } from "@/lib/storagePath";
import { updateContactPhoto } from "./actions";

export interface ContactPhotoTarget {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
}

export function ContactPhotoUploadDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: ContactPhotoTarget | null;
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

  if (!contact) return null;

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
    if (!contact) return;
    if (!photoFile) {
      setError("Selecciona una foto primero.");
      return;
    }
    setIsPending(true);
    setError(null);
    const supabase = createBrowserClient();
    const path = `${crypto.randomUUID()}-${sanitizeFileName(photoFile.name)}`;
    const { error: uploadError } = await supabase.storage.from("contact-photos").upload(path, photoFile);
    if (uploadError) {
      setError(uploadError.message);
      setIsPending(false);
      return;
    }
    const { data } = supabase.storage.from("contact-photos").getPublicUrl(path);
    const result = await updateContactPhoto(contact.id, data.publicUrl);
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
          <DialogTitle>
            Foto de {contact.first_name} {contact.last_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <Avatar className="size-28">
            <AvatarImage src={previewUrl ?? contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-3xl">
              {`${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <input
            type="file"
            accept="image/*"
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
