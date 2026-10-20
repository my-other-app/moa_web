/**
 * Where to go after signing in: `next` when it is a path on this site,
 * `fallback` otherwise.
 *
 * "Starts with one slash" is not enough on its own: browsers read `/\evil.com`
 * as `//evil.com`, and drop tabs and newlines before reading, so `/\t/evil.com`
 * is another site too. The path is resolved against a placeholder origin and
 * kept only if it stays there; what comes back is the resolved path, query
 * and hash, never the text as it arrived.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/")) return fallback;
  const here = "https://moa.invalid";
  try {
    const url = new URL(next, here);
    if (url.origin !== here) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
