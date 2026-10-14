// Site crawler / catalogue extractor.
//
// Portable across Node, Vercel and Cloudflare Workers. It is used in two ways:
//   • at build time — scripts/crawl-mht.ts bakes a snapshot into the bundle so
//     the deployed bot already "knows" the site (works on serverless, where
//     there is no crawl at request time);
//   • at run time — the POST /api/crawl route re-crawls a site on demand.
//
// The MHT ePortal is a Blazor Server app: the eServices catalogue is
// server-rendered on the landing page, while individual /service/* pages render
// client-side behind a login and expose no text server-side. We therefore parse
// the catalogue structure (group → category → service) and synthesise a factual
// record per service, and index any other server-rendered same-origin page.

import { htmlToText, extractTitle, decodeEntities, isSafeUrl } from './extract.js';

const UA = 'Mozilla/5.0 (compatible; PluggableBot/1.0; +https://github.com/pluggable-bot)';
const MAX_HTML_BYTES = 800_000;

export interface CatalogEntry {
  name: string;
  url: string;
  category: string;
  group: string;
}

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  serviceCount: number;
}

export interface CrawlOptions {
  /** Hard cap on the total number of pages returned. Default 200. */
  maxPages?: number;
  /** Cap on extra (non-catalogue) pages fetched. Default 40. */
  maxExtraPages?: number;
  /** Parallel fetches for extra pages. Default 4. */
  concurrency?: number;
}

async function fetchHtml(raw: string): Promise<{ html: string; finalUrl: string; status: number }> {
  const check = isSafeUrl(raw);
  if (!check.ok) throw new Error(check.reason);
  const res = await fetch(check.url.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
  });
  const html = (await res.text()).slice(0, MAX_HTML_BYTES);
  return { html, finalUrl: res.url || raw, status: res.status };
}

/** Parse the eServices catalogue: tabs → category cards → service links. */
export function parseCatalog(html: string, baseUrl: string): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const tabs: string[] = [];

  const tabUl = html.match(/<ul class="nav nav-tabs eServiceTab">([\s\S]*?)<\/ul>/);
  if (tabUl) {
    for (const m of tabUl[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)) {
      const name = decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (name) tabs.push(name);
    }
  }

  const contentStart = html.indexOf('<div class="tab-content">');
  if (contentStart < 0) return out;

  const panes = html.slice(contentStart).split(/<div class="tab-pane/).slice(1);
  panes.forEach((pane, pi) => {
    const group = tabs[pi] ?? '';
    const cards = pane.split('<div class="eserviceCard-header">').slice(1);
    for (const card of cards) {
      const headEnd = card.indexOf('</div>');
      const category =
        headEnd >= 0
          ? decodeEntities(card.slice(0, headEnd).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
          : '';
      for (const a of card.matchAll(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = a[1];
        const name = decodeEntities(a[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (!name) continue;
        let abs = href;
        try {
          abs = new URL(href, baseUrl).toString();
        } catch {
          /* keep raw */
        }
        out.push({ name, url: abs, category, group });
      }
    }
  });

  return out;
}

/** Trim site chrome from an extracted body, starting at the first marker found. */
function sliceFrom(text: string, markers: string[]): string {
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i >= 0) return text.slice(i).trim();
  }
  return text.trim();
}

// Boilerplate produced by the portal shell / Blazor error UI — pure noise for RAG.
const NOISE_LINES = new Set([
  'ok', 'reload', '??', 'en', '/ ar', 'english / en', 'login', 'home',
  'search', 'clear', 'most used eservices', 'تسجيل الدخول',
]);

/** Drop boilerplate/error lines and collapse blank runs. */
function cleanText(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (NOISE_LINES.has(l.toLowerCase())) return false;
      if (/^an error has occurred/i.test(l)) return false;
      if (/^this application may no longer respond/i.test(l)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Run `fn` over `items` with a bounded number of concurrent workers. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Crawl a site starting at `startUrl`. Returns one page record per catalogue
 * entry plus the landing page and any other server-rendered same-origin page.
 */
export async function crawlSite(startUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? 200;
  const maxExtraPages = opts.maxExtraPages ?? 40;
  const concurrency = opts.concurrency ?? 4;

  const home = await fetchHtml(startUrl);
  const catalog = parseCatalog(home.html, home.finalUrl);
  const origin = new URL(home.finalUrl).origin;

  const pages: CrawledPage[] = [];

  const homeText = cleanText(sliceFrom(htmlToText(home.html), ['eServices List', 'eServices']));
  pages.push({
    url: home.finalUrl,
    title: extractTitle(home.html, 'MHT ePortal — eServices List') || 'MHT ePortal — eServices List',
    text:
      homeText +
      '\n\nStructured catalogue (group / category — service):\n' +
      catalog.map((s) => `- ${s.name} [${s.group} / ${s.category}] ${s.url}`).join('\n'),
  });

  // One record per category.
  const byCategory = new Map<string, CatalogEntry[]>();
  for (const s of catalog) {
    const key = `${s.group} / ${s.category}`;
    const list = byCategory.get(key);
    if (list) list.push(s);
    else byCategory.set(key, [s]);
  }
  for (const [key, list] of byCategory) {
    pages.push({
      url: home.finalUrl,
      title: `${key} — eServices`,
      text:
        `Category: ${list[0].category}\nGroup: ${list[0].group}\n\n` +
        `Services in this category:\n` +
        list.map((s) => `- ${s.name}: ${s.url}`).join('\n'),
    });
  }

  // One record per service (factual, built from the catalogue).
  for (const s of catalog) {
    pages.push({
      url: s.url,
      title: s.name,
      text:
        `Service: ${s.name}\n` +
        `Group: ${s.group}\n` +
        `Category: ${s.category}\n` +
        `Portal: ${home.finalUrl}\n` +
        `Apply and manage this eService online at: ${s.url}`,
    });
  }

  // Discover other same-origin HTML pages (e.g. the sign-in page).
  const known = new Set(catalog.map((s) => s.url));
  known.add(home.finalUrl);
  const extraLinks = new Set<string>();
  for (const m of home.html.matchAll(/href="([^"]+)"/gi)) {
    const v = m[1];
    if (/^(#|javascript:|mailto:|tel:|data:)/i.test(v)) continue;
    if (/\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|json|xml|pdf)(\?|$)/i.test(v)) continue;
    if (/(^|\/)(_content|_framework|__bundles)\//i.test(v)) continue;
    try {
      const u = new URL(v, home.finalUrl);
      if (u.origin !== origin) continue;
      if (known.has(u.href)) continue;
      extraLinks.add(u.href);
    } catch {
      /* ignore */
    }
  }

  const extra = [...extraLinks].slice(0, maxExtraPages);
  const fetched = await mapLimit(extra, concurrency, async (link) => {
    try {
      const page = await fetchHtml(link);
      if (page.status >= 400) return null;
      const text = cleanText(sliceFrom(htmlToText(page.html), ['Sign In', 'eServices List']));
      if (text.length < 40) return null;
      const title = extractTitle(page.html, link) || link;
      return { url: page.finalUrl, title, text } satisfies CrawledPage;
    } catch {
      return null;
    }
  });
  for (const p of fetched) if (p) pages.push(p);

  return { pages: pages.slice(0, maxPages), serviceCount: catalog.length };
}
