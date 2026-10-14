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
// the catalogue structure (group → category → service) and synthesise a record
// per service, and index any other server-rendered same-origin page.
//
// The portal can be rendered in Arabic by sending its culture cookie
// (`.AspNetCore.Culture=c=ar-OM|uic=ar-OM`), so we crawl every locale and merge
// the results into bilingual records — this is what makes Arabic questions work.

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

export interface CrawlLocale {
  /** Locale code, e.g. 'en', 'ar'. */
  code: string;
  /** Extra request headers for this locale (e.g. a culture cookie). */
  headers?: Record<string, string>;
}

export interface CrawlResult {
  pages: CrawledPage[];
  serviceCount: number;
  locales: string[];
}

export interface CrawlOptions {
  /** Hard cap on the total number of pages returned. Default 300. */
  maxPages?: number;
  /** Cap on extra (non-catalogue) pages fetched per locale. Default 40. */
  maxExtraPages?: number;
  /** Parallel fetches for extra pages. Default 4. */
  concurrency?: number;
  /** Locales to crawl. Default `[{ code: 'en' }]`. */
  locales?: CrawlLocale[];
}

async function fetchHtml(
  raw: string,
  headers?: Record<string, string>
): Promise<{ html: string; finalUrl: string; status: number }> {
  const check = isSafeUrl(raw);
  if (!check.ok) throw new Error(check.reason);
  const res = await fetch(check.url.toString(), {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      ...(headers ?? {}),
    },
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
  'search', 'clear', 'most used eservices',
  'تسجيل الدخول', 'الصفحة الرئيسية', 'بحث', 'مسح', 'الرئيسية',
  'الأكثر استخدامًا', 'الأكثر استخداما',
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

/** URL-safe slug for synthetic page anchors. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
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

interface LocaleLanding {
  code: string;
  url: string;
  title: string;
  text: string;
  catalog: CatalogEntry[];
  html: string;
}

interface ServiceRecord {
  url: string;
  names: Record<string, string>;
  categories: Record<string, string>;
  groups: Record<string, string>;
}

/**
 * Crawl a site starting at `startUrl`, in every requested locale. Returns one
 * page record per catalogue entry (bilingual) plus the landing page, category
 * listings and any other server-rendered same-origin page.
 */
export async function crawlSite(startUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? 300;
  const maxExtraPages = opts.maxExtraPages ?? 40;
  const concurrency = opts.concurrency ?? 4;
  const locales = opts.locales && opts.locales.length ? opts.locales : [{ code: 'en' }];

  // 1. Fetch + parse the landing page in each locale.
  const landings: LocaleLanding[] = [];
  for (const loc of locales) {
    const home = await fetchHtml(startUrl, loc.headers);
    const catalog = parseCatalog(home.html, home.finalUrl);
    const homeText = cleanText(
      sliceFrom(htmlToText(home.html), ['eServices List', 'eServices', 'قائمة الخدمات', 'الخدمات الإلكترونية'])
    );
    landings.push({
      code: loc.code,
      url: home.finalUrl,
      title: extractTitle(home.html, '') || 'eServices List',
      text: homeText,
      catalog,
      html: home.html,
    });
  }

  const primary = landings[0];
  const origin = new URL(primary.url).origin;
  const codes = landings.map((l) => l.code);

  // 2. Merge catalogues by service URL → bilingual records.
  const services = new Map<string, ServiceRecord>();
  for (const l of landings) {
    for (const e of l.catalog) {
      let rec = services.get(e.url);
      if (!rec) {
        rec = { url: e.url, names: {}, categories: {}, groups: {} };
        services.set(e.url, rec);
      }
      if (e.name) rec.names[l.code] = e.name;
      if (e.category) rec.categories[l.code] = e.category;
      if (e.group) rec.groups[l.code] = e.group;
    }
  }

  const pages: CrawledPage[] = [];

  // 3. Landing page per locale (unique anchor per locale so chunk ids differ).
  for (const l of landings) {
    pages.push({
      url: l.code === codes[0] ? l.url : `${l.url}#${l.code}`,
      title: l.title,
      text:
        l.text +
        `\n\nStructured catalogue (group / category — service) [${l.code}]:\n` +
        l.catalog.map((s) => `- ${s.name} [${s.group} / ${s.category}] ${s.url}`).join('\n'),
    });
  }

  // 4. Category listing per locale.
  for (const l of landings) {
    const byCategory = new Map<string, CatalogEntry[]>();
    for (const s of l.catalog) {
      const key = `${s.group} / ${s.category}`;
      const list = byCategory.get(key);
      if (list) list.push(s);
      else byCategory.set(key, [s]);
    }
    for (const [key, list] of byCategory) {
      pages.push({
        url: l.code === codes[0] ? `${l.url}#cat-${slug(key)}` : `${l.url}#${l.code}-cat-${slug(key)}`,
        title: `${key} — eServices [${l.code}]`,
        text:
          `Category [${l.code}]: ${list[0].category}\nGroup [${l.code}]: ${list[0].group}\n\n` +
          `Services in this category:\n` +
          list.map((s) => `- ${s.name}: ${s.url}`).join('\n'),
      });
    }
  }

  // 5. One bilingual record per service (factual, built from the catalogues).
  for (const rec of services.values()) {
    const title = codes
      .map((c) => rec.names[c])
      .filter(Boolean)
      .join(' | ');
    const lines: string[] = [];
    for (const c of codes) {
      if (rec.names[c]) lines.push(`Service [${c}]: ${rec.names[c]}`);
    }
    for (const c of codes) {
      if (rec.categories[c]) lines.push(`Category [${c}]: ${rec.categories[c]}`);
    }
    for (const c of codes) {
      if (rec.groups[c]) lines.push(`Group [${c}]: ${rec.groups[c]}`);
    }
    lines.push(`Portal: ${primary.url}`);
    lines.push(`Apply and manage this eService online at: ${rec.url}`);
    pages.push({ url: rec.url, title: title || rec.url, text: lines.join('\n') });
  }

  // 6. Discover other same-origin HTML pages (e.g. the sign-in page).
  const known = new Set([...services.keys(), primary.url]);
  for (const l of landings) {
    const extraLinks = new Set<string>();
    const homeHtml = l.html;
    for (const m of homeHtml.matchAll(/href="([^"]+)"/gi)) {
      const v = m[1];
      if (/^(#|javascript:|mailto:|tel:|data:)/i.test(v)) continue;
      if (/\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|json|xml|pdf)(\?|$)/i.test(v)) continue;
      if (/(^|\/)(_content|_framework|__bundles)\//i.test(v)) continue;
      try {
        const u = new URL(v, l.url);
        if (u.origin !== origin) continue;
        if (known.has(u.href)) continue;
        extraLinks.add(u.href);
      } catch {
        /* ignore */
      }
    }

    const list = [...extraLinks].slice(0, maxExtraPages);
    const fetched = await mapLimit(list, concurrency, async (link) => {
      try {
        const r = await fetchHtml(link, locales.find((x) => x.code === l.code)?.headers);
        if (r.status >= 400) return null;
        const text = cleanText(sliceFrom(htmlToText(r.html), ['Sign In', 'eServices List', 'تسجيل الدخول', 'قائمة الخدمات']));
        if (text.length < 40) return null;
        const title = extractTitle(r.html, link) || link;
        return {
          url: l.code === codes[0] ? r.finalUrl : `${r.finalUrl}#${l.code}`,
          title,
          text,
        } satisfies CrawledPage;
      } catch {
        return null;
      }
    });
    for (const p of fetched) if (p) pages.push(p);
  }

  return { pages: pages.slice(0, maxPages), serviceCount: services.size, locales: codes };
}
