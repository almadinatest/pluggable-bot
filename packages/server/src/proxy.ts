// Server-side HTML proxy for the viewer — lets you "view" sites that refuse to
// be framed (X-Frame-Options / CSP `frame-ancestors`). The rewritten page is
// served from our own origin, so the browser never applies the target's framing
// policy. Portable across Node, Vercel and Cloudflare Workers (no DOM APIs).
//
// Because the page now runs on *our* origin, anything the browser fetches
// cross-origin without the right CORS headers (fonts, Blazor's fetch to
// /_blazor/initializers, …) would log console errors. Two mitigations:
//   • stylesheets are routed through /proxy so their `url(...)` font/image
//     references are rewritten to same-origin requests;
//   • the Blazor bootstrap is removed — its SignalR circuit cannot run
//     cross-origin, so it only produced CORS errors and an error toast.

import { isSafeUrl } from './extract.js';

const PROXY_TIMEOUT_MS = 12_000;
const MAX_PROXY_BYTES = 3_000_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; PluggableBot/1.0; +https://github.com/pluggable-bot)';

export interface RawResource {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
  status: number;
}

/** Fetch a resource and return its raw bytes + metadata (SSRF-guarded). */
export async function fetchRawResource(raw: string, init?: RequestInit): Promise<RawResource> {
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
          'text/html,application/xhtml+xml,application/xml;q=0.9,text/css;q=0.8,image/avif,image/webp,font/woff2,*/*;q=0.7',
      },
      ...(init ?? {}),
    });
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0, MAX_PROXY_BYTES));
    return {
      bytes,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
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
 * Resolve a link/href value against a base. Returns the absolute target URL
 * when it points at the target origin, or null when it should be left alone
 * (external, hash-only, javascript:, data:, already-proxied…).
 */
function resolveTargetLink(value: string, origin: string, baseHref: string): string | null {
  const v = value.trim();
  if (!v || v.startsWith('#')) return null;
  if (/^(javascript|mailto|tel|data|about|blob|file|ftp|sms):/i.test(v)) return null;
  if (v.startsWith('/proxy?url=')) return null; // already proxied
  try {
    const u = new URL(v, baseHref);
    if (u.origin !== origin) return null; // external — leave as-is
    return u.toString();
  } catch {
    return null;
  }
}

function proxied(abs: string, selfOrigin: string): string {
  // Must be absolute: the injected <base href="target/"> would otherwise resolve
  // a root-relative /proxy path against the *target* origin.
  return `${selfOrigin}/proxy?url=${encodeURIComponent(abs)}`;
}

/**
 * Rewrite `url(...)` and bare `@import "…"` references in a stylesheet so
 * fonts/images load from our origin (avoiding CORS on the target's fonts).
 */
export function rewriteCss(css: string, cssUrl: string, selfOrigin = ''): string {
  let origin: string;
  try {
    origin = new URL(cssUrl).origin;
  } catch {
    return css;
  }
  const wrap = (val: string): string | null => {
    const abs = resolveTargetLink(val, origin, cssUrl);
    return abs ? proxied(abs, selfOrigin) : null;
  };

  let out = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, val) => {
    const w = wrap(String(val).trim());
    return w ? `url(${q}${w}${q})` : m;
  });
  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, val) => {
    const w = wrap(String(val).trim());
    return w ? `@import ${q}${w}${q}` : m;
  });
  return out;
}

/**
 * Rewrite the target HTML so it renders inside our /proxy iframe:
 *  - an injected <base> makes relative CSS/JS/img URLs resolve to the real site,
 *  - the Blazor bootstrap script is dropped,
 *  - same-site <a> links and <form> actions are rerouted through /proxy,
 *  - same-site stylesheets are routed through /proxy (so their font URLs are
 *    rewritten), and url()s inside inline <style> blocks are rewritten too.
 */
export function rewriteProxiedHtml(html: string, finalUrl: string, selfOrigin = ''): string {
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

  // Drop the Blazor bootstrap (web/server variants + modulepreloads). Its
  // SignalR circuit cannot connect cross-origin — it only logs CORS errors and
  // shows the "An error has occurred" toast.
  out = out.replace(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']*_framework\/blazor[^"']*["'][^>]*>\s*<\/script>/gi,
    ''
  );
  out = out.replace(
    /<link\b[^>]*\brel\s*=\s*["']?modulepreload["']?[^>]*\bhref\s*=\s*["'][^"']*_framework\/blazor[^"']*["'][^>]*>/gi,
    ''
  );

  // Never let the inert Blazor error UI become visible.
  const guard = '<style>#blazor-error-ui{display:none!important}</style>';
  if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${guard}</head>`);
  else out = guard + out;

  const wrap = (val: string): string | null => {
    const abs = resolveTargetLink(val, origin, baseHref);
    return abs ? proxied(abs, selfOrigin) : null;
  };

  out = out.replace(/(<a\b[^>]*?href\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, val) => {
    const w = wrap(val);
    return w ? pre + q + w + q : m;
  });
  out = out.replace(/(<form\b[^>]*?action\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, val) => {
    const w = wrap(val);
    return w ? pre + q + w + q : m;
  });

  // Route same-origin stylesheets through the proxy so their font/image url()s
  // can be rewritten to same-origin (cross-origin fonts are CORS-blocked).
  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    return tag.replace(/(href\s*=\s*)(["'])(.*?)\2/i, (m, pre, q, val) => {
      const w = wrap(val);
      return w ? pre + q + w + q : m;
    });
  });

  // Inline <style> blocks: rewrite url()/@import against the document base.
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, css, close) => {
    return open + rewriteCss(css, baseHref, selfOrigin) + close;
  });

  return out;
}
