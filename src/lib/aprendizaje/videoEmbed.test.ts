import { describe, expect, it } from "vitest";
import { toVideoEmbed } from "./videoEmbed";

const yt = (id: string) => ({ kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` });

describe("toVideoEmbed", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("embeds YouTube link %s", (url, id) => {
    expect(toVideoEmbed(url)).toEqual(yt(id));
  });

  it.each(["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"])("embeds Vimeo link %s", (url) => {
    expect(toVideoEmbed(url)).toEqual({ kind: "iframe", provider: "vimeo", src: "https://player.vimeo.com/video/123456789" });
  });

  it("falls back to an external link for other providers (Stream, SharePoint...)", () => {
    const url = "https://empresa.sharepoint.com/:v:/s/sitio/EabcDEF";
    expect(toVideoEmbed(url)).toEqual({ kind: "link", href: url });
  });

  it("falls back to a link for a YouTube URL without a video id", () => {
    expect(toVideoEmbed("https://www.youtube.com/@canal")).toEqual({ kind: "link", href: "https://www.youtube.com/@canal" });
  });

  it.each(["", "no es un enlace", "javascript:alert(1)", "ftp://example.com/video.mp4"])("rejects %j", (url) => {
    expect(toVideoEmbed(url)).toBeNull();
  });
});
