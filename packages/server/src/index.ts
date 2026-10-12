import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { chatRoute } from './chat.js';
import { trainRoute } from './train.js';
import { getChunkCount, seedMhtKnowledge } from './knowledge.js';
import { env } from './env.js';
import { WIDGET_JS, MHT_HTML, INDEX_HTML, VIEW_HTML, PLUG_HTML } from './assets.generated.js';
import { fetchUrlPage } from './extract.js';

// Pre-seed MHT knowledge base at startup
seedMhtKnowledge();

// Replace the __API_URL__ placeholder in demo pages at serve time so the
// pages work on any deployment without hard-coding an origin. An empty
// PUBLIC_API_URL means "same origin" (relative URLs).
function renderPage(html: string): string {
  return html.split('__API_URL__').join(env.publicApiUrl);
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
