function md5(text: string): string {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(text);
  return hasher.digest("hex");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header)) !== null) {
    result[match[1]] = match[2] ?? match[3];
  }
  return result;
}

export interface DigestFetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/**
 * Performs an HTTP request with RFC 2617 Digest authentication, retrying
 * once with credentials after an initial 401 challenge. Implemented by hand
 * (rather than via the `digest-fetch` npm package) because `digest-fetch`'s
 * transitive dependency `js-sha256` hides its `require('crypto')` call
 * behind `eval(...)` specifically to dodge static bundler analysis - which
 * breaks under `bun build --compile` (confirmed by hand: a compiled
 * executable that merely constructs a `DigestFetch` instance crashes with
 * `ReferenceError: require is not defined` the first time it's used). This
 * implementation only uses Bun's native `Bun.CryptoHasher` (confirmed
 * working both under `bun run` and compiled) and never touches Node's
 * `crypto` module or `require` at all.
 */
export async function digestFetch(
  url: string,
  username: string,
  password: string,
  options: DigestFetchOptions,
): Promise<Response> {
  const initialResponse = await fetch(url, { ...options, headers: options.headers, signal: options.signal });
  if (initialResponse.status !== 401) return initialResponse;

  const wwwAuth = initialResponse.headers.get("www-authenticate");
  if (!wwwAuth || !wwwAuth.toLowerCase().startsWith("digest ")) return initialResponse;

  const challenge = parseDigestChallenge(wwwAuth.slice(wwwAuth.indexOf(" ") + 1));
  const { realm, nonce, qop, opaque } = challenge;
  const parsedUrl = new URL(url);
  const uri = parsedUrl.pathname + parsedUrl.search;
  const method = options.method;
  const nc = "00000001";
  const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const authParts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    qop ? `qop=${qop}` : null,
    qop ? `nc=${nc}` : null,
    qop ? `cnonce="${cnonce}"` : null,
    `response="${response}"`,
    opaque ? `opaque="${opaque}"` : null,
  ].filter((v): v is string => v !== null);

  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Digest ${authParts.join(", ")}` },
    signal: options.signal,
  });
}
