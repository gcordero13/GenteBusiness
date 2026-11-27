import { ExternalLink, Eye, PlayCircle } from "lucide-react";
import { archivoUrl, type Leccion } from "@/lib/aprendizaje/types";
import { toVideoEmbed } from "@/lib/aprendizaje/videoEmbed";
import { etiquetaArchivo, tamanoArchivo } from "@/lib/aprendizaje/visor";
import { ArchivoVisor } from "./ArchivoVisor";

/** Widest the video gets: 16:9 at ~60% of the screen height. Also used to align the text below it. */
export const VIDEO_MAX_WIDTH = "calc(60dvh * 16 / 9)";

export function hasVideo(leccion: Leccion): boolean {
  return Boolean(leccion.videoFile || (leccion.videoUrl && toVideoEmbed(leccion.videoUrl)));
}

/**
 * The lesson's video at the top of the page, as large as the width allows
 * without growing taller than ~60% of the screen, so it's fully visible
 * with room for the title and the bottom bar.
 */
export function LeccionVideo({ leccion }: { leccion: Pick<Leccion, "title" | "videoUrl" | "videoFile"> }) {
  const embed = leccion.videoUrl ? toVideoEmbed(leccion.videoUrl) : null;
  return (
    <div className="mx-auto w-full" style={{ maxWidth: VIDEO_MAX_WIDTH }}>
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
        {leccion.videoFile ? (
          <video controls preload="metadata" src={archivoUrl(leccion.videoFile)} className="size-full" />
        ) : embed?.kind === "iframe" ? (
          <iframe
            src={embed.src}
            title={leccion.title}
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : embed?.kind === "link" ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 text-white">
            <PlayCircle className="size-14 opacity-80" />
            <a
              href={embed.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              <ExternalLink className="size-4" />
              Abrir video
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Everything in the lesson except the video: text, images and materials. */
export function LeccionContent({ leccion }: { leccion: Leccion }) {
  const images = leccion.archivos.filter((a) => a.contentType.startsWith("image/"));
  const documents = leccion.archivos.filter((a) => !a.contentType.startsWith("image/"));

  return (
    <div className="space-y-5">
      {leccion.body && <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">{leccion.body}</div>}

      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((img) => (
            <ArchivoVisor
              key={img.id}
              archivo={img}
              triggerLabel={`Ampliar ${img.filename}`}
              triggerClassName="block overflow-hidden rounded-lg border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL */}
              <img src={archivoUrl(img)} alt={img.filename} className="w-full transition-transform hover:scale-[1.02]" />
            </ArchivoVisor>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Guías y materiales</h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {documents.map((doc) => (
              <li key={doc.id}>
                <ArchivoVisor
                  archivo={doc}
                  triggerLabel={`Ver ${doc.filename}`}
                  triggerClassName="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:border-[#04B1AF] hover:bg-[#04B1AF]/5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#04B1AF]/10 text-[10px] font-bold text-[#036E6C] dark:text-[#5FD6D4]">
                    {etiquetaArchivo(doc.filename)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{doc.filename}</span>
                    {doc.sizeBytes != null && (
                      <span className="block text-xs text-muted-foreground">{tamanoArchivo(doc.sizeBytes)}</span>
                    )}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#036E6C] dark:text-[#5FD6D4]">
                    <Eye className="size-4" />
                    Ver
                  </span>
                </ArchivoVisor>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
