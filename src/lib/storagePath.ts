// Supabase Storage rejects object keys with spaces, accented letters, or
// other non-ASCII characters ("Invalid key"). Uploads previously used the
// raw browser File#name verbatim, so any photo like "Maria Pena ..JPG"
// would fail. This strips it down to a safe ASCII slug + extension.
const ACCENTED_TO_ASCII: Record<string, string> = {
  a: "aàáâãäå",
  e: "eèéêë",
  i: "iìíîï",
  o: "oòóôõö",
  u: "uùúûü",
  n: "nñ",
  c: "cç",
};

const ASCII_BY_ACCENTED = Object.entries(ACCENTED_TO_ASCII).reduce<Record<string, string>>(
  (acc, [ascii, accentedChars]) => {
    for (const char of accentedChars) acc[char] = ascii;
    return acc;
  },
  {},
);

function transliterate(value: string): string {
  return value
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const replacement = ASCII_BY_ACCENTED[lower];
      if (!replacement) return char;
      return char === lower ? replacement : replacement.toUpperCase();
    })
    .join("");
}

export function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < name.length - 1;
  const base = hasExt ? name.slice(0, lastDot) : name;
  const ext = hasExt ? name.slice(lastDot + 1) : "";

  const safeBase = transliterate(base)
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const finalBase = safeBase || "file";

  return safeExt ? `${finalBase}.${safeExt}` : finalBase;
}
