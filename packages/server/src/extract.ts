// Fetch a remote page and extract its visible text for indexing / reader view.
// Portable across Node, Vercel, and Cloudflare Workers — no DOM APIs required.

const USER_AGENT =
  'Mozilla/5.0 (compatible; PluggableBot/1.0; +https://github.com/pluggable-bot)';

const MAX_BYTES = 500_000; // cap downloaded HTML
const MAX_CHARS = 60_000;  // cap extracted text
const TIMEOUT_MS = 12_000;

export interface ExtractedPage {
  url: string;
  title: string;
  text: string;
}

/** Reject unsafe targets (non-http, localhost, private ranges) to limit SSRF. */
export function isSafeUrl(
  raw: string
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'only http(s) URLs are allowed' };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::1'
  ) {
    return { ok: false, reason: 'blocked host' };
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const priv =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
    if (priv) return { ok: false, reason: 'blocked private address' };
  }
  return { ok: true, url };
}

/** Decode HTML entities (numeric + common named). */
export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', middot: '·', copy: '©', reg: '®', trade: '™',
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9#]+);/gi, (m, n: string) => named[n.toLowerCase()] ?? m);
}

/** Strip HTML down to readable text (no DOM required). */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Preserve some structure as line breaks
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|header|footer|nav)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Extract the <title> (decoded), falling back to `fallback`. */
export function extractTitle(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
  return t || fallback;
}

/** Fetch a URL and return its title + extracted visible text. */
export async function fetchUrlPage(raw: string): Promise<ExtractedPage> {
  const check = isSafeUrl(raw);
  if (!check.ok) throw new Error(check.reason);
  const { url } = check;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    const html = body.slice(0, MAX_BYTES);
    return {
      url: url.toString(),
      title: extractTitle(html, url.hostname),
      text: htmlToText(html).slice(0, MAX_CHARS),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg === 'The operation was aborted.' ? 'request timed out' : msg);
  } finally {
    clearTimeout(timer);
  }
}
