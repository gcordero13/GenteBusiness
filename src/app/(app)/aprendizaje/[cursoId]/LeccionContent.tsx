import { Download, ExternalLink } from "lucide-react";
import { archivoUrl, type Leccion } from "@/lib/aprendizaje/types";
import { toVideoEmbed } from "@/lib/aprendizaje/videoEmbed";

export function LeccionContent({ leccion }: { leccion: Leccion }) {
  const embed = leccion.videoUrl ? toVideoEmbed(leccion.videoUrl) : null;
  const images = leccion.archivos.filter((a) => a.contentType.startsWith("image/"));
  const documents = leccion.archivos.filter((a) => !a.contentType.startsWith("image/"));

  return (
    <div className="space-y-5">
      {leccion.videoFile && (
        <video
          controls
          preload="metadata"
          src={archivoUrl(leccion.videoFile)}
          className="aspect-video w-full rounded-xl bg-black"
        />
      )}
      {embed?.kind === "iframe" && (
        <iframe
          src={embed.src}
          title={leccion.title}
          className="aspect-video w-full rounded-xl"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      )}
      {embed?.kind === "link" && (
        <a
          href={embed.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <ExternalLink className="size-4" />
          Abrir video
        </a>
      )}

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
