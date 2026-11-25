export type VideoEmbed =
  | { kind: "iframe"; provider: "youtube" | "vimeo"; src: string }
  | { kind: "link"; href: string };

const YOUTUBE_ID = /^[\w-]{6,20}$/;

function youtube(id: string | null | undefined): VideoEmbed | null {
  return id && YOUTUBE_ID.test(id)
    ? { kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` }
    : null;
}

/**
 * Turns a lesson's video link into something renderable: YouTube/Vimeo
 * become embeddable iframe URLs; any other http(s) link (Microsoft Stream,
 * SharePoint, etc.) is shown as an "open video" link. Returns null for
 * anything that isn't an http(s) URL, which the editor rejects.
 */
export function toVideoEmbed(rawUrl: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const link: VideoEmbed = { kind: "link", href: url.toString() };

  if (host === "youtu.be") return youtube(url.pathname.split("/")[1]) ?? link;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return youtube(url.searchParams.get("v")) ?? link;
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
    return youtube(match?.[1]) ?? link;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)/);
    return match ? { kind: "iframe", provider: "vimeo", src: `https://player.vimeo.com/video/${match[1]}` } : link;
  }
  return link;
}
