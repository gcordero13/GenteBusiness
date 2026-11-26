import { Download, ExternalLink, PlayCircle } from "lucide-react";
import { archivoUrl, type Leccion } from "@/lib/aprendizaje/types";
import { toVideoEmbed } from "@/lib/aprendizaje/videoEmbed";

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
    <div className="mx-auto w-full" style={{ maxWidth: "calc(60dvh * 16 / 9)" }}>
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
            // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
            <img key={img.id} src={archivoUrl(img)} alt={img.filename} className="w-full rounded-lg border" />
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Guías y materiales</h3>
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc.id}>
                <a
                  href={archivoUrl(doc)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-[#04B1AF] hover:underline"
                >
                  <Download className="size-4" />
                  {doc.filename}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
