import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { chatRoute } from './chat.js';
import { trainRoute } from './train.js';
import { getChunkCount, seedMhtKnowledge, addChunks, splitIntoChunks } from './knowledge.js';
import { env } from './env.js';
import { WIDGET_JS, MHT_HTML, INDEX_HTML, VIEW_HTML, PLUG_HTML } from './assets.generated.js';
import { fetchUrlPage } from './extract.js';
import { crawlSite } from './crawl.js';
import { fetchRawResource, rewriteProxiedHtml, rewriteCss } from './proxy.js';
import type { KnowledgeChunk } from './types.js';

// Pre-seed MHT knowledge base at startup
seedMhtKnowledge();

// Replace the __API_URL__ placeholder in demo pages at serve time so the
// pages work on any deployment without hard-coding an origin. An empty
// PUBLIC_API_URL means "same origin" (relative URLs).
function renderPage(html: string): string {
  return html.split('__API_URL__').join(env.publicApiUrl);
}

/**
 * Public origin of the current request. Vercel/Cloudflare terminate TLS in front
 * of the function and may forward an `http` URL, so we prefer the proxy headers —
 * otherwise absolute /proxy links would be emitted as http:// on an https page
 * and be blocked as mixed content.
 */
function publicOrigin(c: { req: { url: string; header: (n: string) => string | undefined } }): string {
  let u: URL;
  try {
    u = new URL(c.req.url);
  } catch {
    return '';
  }
  const proto =
    c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() || u.protocol.replace(':', '');
  const host =
    c.req.header('x-forwarded-host')?.split(',')[0]?.trim() ||
    c.req.header('host') ||
    u.host;
  return `${proto}://${host}`;
}

const app = new Hono();
app.use('*', cors({ origin: env.corsOrigin }));

chatRoute(app);
trainRoute(app);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', chunks: getChunkCount() });
});

// Reader view: fetch any URL server-side and return its extracted text.
// Used by /view as a fallback for sites that block being framed.
app.get('/api/reader', async (c) => {
  const url = c.req.query('url') ?? '';
  if (!url) return c.json({ error: 'url required' }, 400);
  try {
    return c.json(await fetchUrlPage(url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// HTML proxy: render sites that refuse to be framed (X-Frame-Options / CSP
// frame-ancestors) inside our own origin. GET fetches and rewrites the page;
// POST forwards a simple form submission to the target.
app.all('/proxy', async (c) => {
  const url = c.req.query('url') ?? '';
  if (!url) return c.text('url required', 400);
  // Absolute base for our own /proxy links — required because the target page
  // sets <base href="target/">, which would otherwise re-resolve them.
  const selfOrigin = env.publicApiUrl || publicOrigin(c);
  try {
    const init: RequestInit = {};
    if (c.req.method === 'POST') {
      init.method = 'POST';
      init.body = await c.req.formData();
    }
    const res = await fetchRawResource(url, init);
    const ct = res.contentType;

    let body: string | Uint8Array;
    let contentType = ct;
    if (/html/i.test(ct)) {
      body = rewriteProxiedHtml(new TextDecoder().decode(res.bytes), res.finalUrl, selfOrigin);
      contentType = 'text/html; charset=utf-8';
    } else if (/css/i.test(ct)) {
      body = rewriteCss(new TextDecoder().decode(res.bytes), res.finalUrl, selfOrigin);
      contentType = 'text/css; charset=utf-8';
    } else {
      // Binary passthrough (fonts, images, …) so bytes are not mangled.
      body = res.bytes;
    }

    return new Response(body, {
      status: res.status >= 400 ? res.status : 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`<h1>Proxy error</h1><p>${msg}</p>`, {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});

// Crawl a whole site and index all of its text. Bounded so it stays within
// serverless time limits; the results live in the in-memory store for the life
// of the instance. (The MHT ePortal snapshot is baked in at build time.)
app.post('/api/crawl', async (c) => {
  let body: { url?: string; maxPages?: number } = {};
  try {
    body = await c.req.json();
  } catch {
    /* allow empty body */
  }
  const url = (body.url ?? '').trim();
  if (!url) return c.json({ error: 'url required' }, 400);

  const maxPages = Math.min(Math.max(Number(body.maxPages) || 120, 1), 300);
  try {
    const { pages, serviceCount } = await crawlSite(url, { maxPages });
    const chunks: KnowledgeChunk[] = [];
    for (const page of pages) {
      if (!page.text.trim()) continue;
      chunks.push(...splitIntoChunks(page.text, page.title, page.url));
    }
    addChunks(chunks);
    return c.json({
      pages: pages.length,
      services: serviceCount,
      chunksAdded: chunks.length,
      total: getChunkCount(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// Serve the compiled widget JS (inlined at build time by scripts/generate-assets.mjs)
app.get('/widget/pluggable-bot.js', (c) => {
  if (!WIDGET_JS) {
    return new Response('// widget not built yet — run: npm run build', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }
  return new Response(WIDGET_JS, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': `public, max-age=${env.widgetCacheMaxAge}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// Viewer — load any web link with the bot plugged in (/view?url=…)
app.get('/view', (c) => {
  if (!VIEW_HTML) return c.html('<h1>Viewer page not found</h1>', 404);
  return c.html(renderPage(VIEW_HTML));
});

// Landing page — enter a URL, grab the bookmarklet or embed snippet
app.get('/plug', (c) => {
  if (!PLUG_HTML) return c.html('<h1>Plug page not found</h1>', 404);
  return c.html(renderPage(PLUG_HTML));
});

// MHT ePortal demo page
app.get('/mht', (c) => {
  if (!MHT_HTML) return c.html('<h1>MHT portal page not found</h1>', 404);
  return c.html(renderPage(MHT_HTML));
});

// Demo index page
app.get('/', (c) => {
  if (!INDEX_HTML) return c.html(DEMO_HTML);
  return c.html(renderPage(INDEX_HTML));
});

const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Pluggable Bot Inline Fallback</h1>
  <script src="/widget/pluggable-bot.js"></script>
</body>
</html>`;

export default app;
