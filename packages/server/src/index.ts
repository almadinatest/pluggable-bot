import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { chatRoute } from './chat.js';
import { trainRoute } from './train.js';
import { getChunkCount, seedMhtKnowledge } from './knowledge.js';
import { env } from './env.js';
import { WIDGET_JS, MHT_HTML, INDEX_HTML } from './assets.generated.js';

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
