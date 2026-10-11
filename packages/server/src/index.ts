import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { chatRoute } from './chat.js';
import { trainRoute } from './train.js';
import { getChunkCount, seedMhtKnowledge } from './knowledge.js';

// Import assets directly as strings via ES Modules
// Paths match the relative positions based on your original wrangler.toml configuration
// Fix the paths to target specific files
import WIDGET_JS from "../../widget/dist/pluggable-bot.js";
import MHT_HTML from "../../../demo/mht-portal.html";
import INDEX_HTML from "../../../demo/index.html";

// Pre-seed MHT knowledge base at startup (no-op if already populated)
seedMhtKnowledge();

const app = new Hono();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use('*', cors());

// ── Routes ────────────────────────────────────────────────────────────────────
chatRoute(app);
trainRoute(app);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', chunks: getChunkCount() });
});

// Serve the compiled widget JS — read statically at compilation
app.get('/widget/pluggable-bot.js', (c) => {
  // Check if your build has produced content, if not, output a fallback string
  if (!WIDGET_JS || WIDGET_JS.trim() === "") {
    return new Response('// widget not built yet — run: npm run build', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }

  return new Response(WIDGET_JS, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// MHT ePortal demo page — served directly from compilation bundle
app.get('/mht', (c) => {
  if (!MHT_HTML) {
    return c.html('<h1>MHT portal page not found</h1>', 404);
  }
  return c.html(MHT_HTML);
});

// Demo index page — served directly from compilation bundle, falls back to inline HTML
app.get('/', (c) => {
  if (INDEX_HTML) {
    return c.html(INDEX_HTML);
  }
  return c.html(DEMO_HTML);
});

// Inline fallback demo page (used only when demo/index.html is absent)
const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acme Analytics — Pluggable Bot Demo</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-dark: #4338ca;
      --text: #111827;
      --muted: #6b7280;
      --bg: #f9fafb;
      --card: #ffffff;
      --border: #e5e7eb;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    nav { background: var(--card); border-bottom: 1px solid var(--border); padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; height: 64px; position: sticky; top: 0; z-index: 100; }
    nav .logo { font-size: 1.25rem; font-weight: 700; color: var(--primary); }
    .hero { background: linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%); color: #fff; text-align: center; padding: 6rem 2rem 5rem; }
    .hero h1 { font-size: 3rem; font-weight: 800; margin-bottom: 1rem; }
    .hero p { font-size: 1.25rem; opacity: .9; max-width: 600px; margin: 0 auto 2rem; }
    footer { background: var(--card); border-top: 1px solid var(--border); text-align: center; padding: 2rem; color: var(--muted); font-size: 0.875rem; }
  </style>
</head>
<body>
<nav><span class="logo">Pluggable Bot</span></nav>
<div class="hero">
  <h1>Pluggable Bot</h1>
  <p>AI chat widget for any website. Visit <a style="color:#fff;text-decoration:underline; " href="/mht">/mht</a> for the MHT demo.</p>
</div>
<footer>&copy; 2025 Pluggable Bot</footer>
<script src="/widget/pluggable-bot.js" data-api-url="" data-bot-name="Assistant" data-primary-color="#4f46e5"></script>
</body>
</html>`;

export default app;
