"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFileInChunks } from "@/lib/aprendizaje/chunkedUpload";
import { UPLOAD_ACCEPT, validateUpload, type UploadKind } from "@/lib/aprendizaje/files";
import type { DriveFileRef } from "@/lib/aprendizaje/types";
import { startUpload } from "../actions";

export interface UploadedFile extends DriveFileRef {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Uploads straight from the browser to SharePoint: the server only opens
 * the upload session (startUpload), so large videos never go through
 * Vercel. onUploaded saves the reference and may return an error message.
 */
export function SharePointUploadButton({
  kind,
  label,
  onUploaded,
  disabled,
}: {
  kind: UploadKind;
  label: string;
  onUploaded: (file: UploadedFile) => Promise<string | undefined | void> | void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const invalid = validateUpload(kind, file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setProgress(0);
    try {
      const session = await startUpload(kind, { name: file.name, size: file.size, type: file.type });
      if (!session.uploadUrl) {
        setError(session.error ?? "No se pudo iniciar la subida.");
        return;
      }
      const item = await uploadFileInChunks(file, session.uploadUrl, { onProgress: setProgress });
      const saveError = await onUploaded({
        ...item,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (saveError) setError(saveError);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT[kind] || undefined}
        className="hidden"
        data-testid="upload-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || progress !== null}
        onClick={() => inputRef.current?.click()}
      >
        <Upload data-icon="inline-start" />
        {progress !== null ? `Subiendo… ${Math.round(progress * 100)}%` : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
