import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "./storagePath";

describe("sanitizeFileName", () => {
  it("replaces accented letters with their ASCII equivalent", () => {
    expect(sanitizeFileName("María Peña.jpg")).toBe("maria-pena.jpg");
  });

  it("collapses spaces and repeated dots before the extension", () => {
    expect(sanitizeFileName("MARIA YISSEL PEÑALO REYES ..JPG")).toBe(
      "maria-yissel-penalo-reyes.jpg",
    );
  });

  it("keeps a simple ascii name unchanged apart from casing", () => {
    expect(sanitizeFileName("photo.png")).toBe("photo.png");
  });

  it("falls back to 'file' when nothing safe remains in the base name", () => {
    expect(sanitizeFileName("....png")).toBe("file.png");
  });

  it("handles a name with no extension", () => {
    expect(sanitizeFileName("no-extension-file")).toBe("no-extension-file");
  });
});
