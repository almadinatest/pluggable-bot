// Server-side HTML proxy for the viewer — lets you "view" sites that refuse to
// be framed (X-Frame-Options / CSP `frame-ancestors`). The rewritten page is
// served from our own origin, so the browser never applies the target's framing
// policy. Portable across Node, Vercel and Cloudflare Workers (no DOM APIs).

import { isSafeUrl } from './extract.js';

const PROXY_TIMEOUT_MS = 12_000;
const MAX_PROXY_BYTES = 2_000_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; PluggableBot/1.0; +https://github.com/pluggable-bot)';

export interface RawPage {
  html: string;
  contentType: string;
  finalUrl: string;
  status: number;
}

/** Fetch a page and return its raw HTML + metadata (SSRF-guarded). */
export async function fetchRawPage(raw: string, init?: RequestInit): Promise<RawPage> {
  const check = isSafeUrl(raw);
  if (!check.ok) throw new Error(check.reason);
  const url = check.url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      ...(init ?? {}),
    });
    const body = await res.text();
    return {
      html: body.slice(0, MAX_PROXY_BYTES),
      contentType: res.headers.get('content-type') ?? 'text/html',
      finalUrl: res.url || url.toString(),
      status: res.status,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg === 'The operation was aborted.' ? 'request timed out' : msg);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a link/href value against the target origin. Returns the absolute
 * target URL when it points at the target origin, or null when it should be
 * left alone (external, hash-only, javascript:, mailto:, already-proxied…).
 */
function resolveTargetLink(value: string, origin: string, baseHref: string): string | null {
  const v = value.trim();
  if (!v || v.startsWith('#')) return null;
  if (/^(javascript|mailto|tel|data|about|blob|file|ftp|sms):/i.test(v)) return null;
  if (v.startsWith('/proxy?url=')) return null; // already proxied
  try {
    const u = new URL(v, baseHref);
    if (u.origin !== origin) return null; // external link — leave as-is
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Rewrite the target HTML so it renders inside our /proxy iframe:
 *  - an injected <base> makes relative CSS/JS/img URLs resolve to the real site,
 *  - same-site <a> links and <form> actions are rerouted through /proxy so
 *    browsing stays inside the viewer.
 */
export function rewriteProxiedHtml(html: string, finalUrl: string): string {
  let target: URL;
  try {
    target = new URL(finalUrl);
  } catch {
    return html;
  }
  const origin = target.origin;
  const baseHref = origin + '/';

  let out = html;
  if (/<head[\s>]/i.test(out)) {
    out = out.replace(/(<head[^>]*>)/i, `$1<base href="${baseHref}">`);
  } else {
    out = `<head><base href="${baseHref}"></head>` + out;
  }

  const wrap = (val: string): string | null => {
    const abs = resolveTargetLink(val, origin, baseHref);
    return abs ? `/proxy?url=${encodeURIComponent(abs)}` : null;
  };

  out = out.replace(/(<a\b[^>]*?href\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, val) => {
    const w = wrap(val);
    return w ? pre + q + w + q : m;
  });
  out = out.replace(/(<form\b[^>]*?action\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, val) => {
    const w = wrap(val);
    return w ? pre + q + w + q : m;
  });
  return out;
}