import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { chatRoute } from './chat.js';
import { trainRoute } from './train.js';
import { getChunkCount, seedMhtKnowledge } from './knowledge.js';

// Pre-seed MHT knowledge base at startup
seedMhtKnowledge();

// Static ES Module compilation inputs for Cloudflare Workers
import WIDGET_JS_STATIC from "../../../widget/dist/pluggable-bot.js";
import MHT_HTML_STATIC from "../../../../demo/mht-portal.html";
import INDEX_HTML_STATIC from "../../../../demo/index.html";

const app = new Hono();
app.use('*', cors());

chatRoute(app);
trainRoute(app);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', chunks: getChunkCount() });
});

// Helper function to resolve files seamlessly across Vercel and Cloudflare
async function loadAsset(staticAsset: string, relativePath: string): Promise<string> {
  // If the bundler pre-loaded it into memory (Cloudflare Workers strategy), use it!
  if (staticAsset && staticAsset.trim().length > 0 && !staticAsset.startsWith("<!doctype html>")) {
    return staticAsset;
  }
  
  // Vercel Serverless Fallback: Read dynamically from disk using Node compatibility layer
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const projectRoot = path.join(__dirname, '..', '..', '..');
    const targetPath = path.join(projectRoot, ...relativePath.split('/'));
    
    return fs.readFileSync(targetPath, 'utf8');
  } catch (e) {
    return '';
  }
}

// Serve the compiled widget JS
app.get('/widget/pluggable-bot.js', async (c) => {
  const js = await loadAsset(WIDGET_JS_STATIC, "packages/widget/dist/pluggable-bot.js");
  if (!js) {
    return new Response('// widget not built yet — run: npm run build', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }
  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// MHT ePortal demo page
app.get('/mht', async (c) => {
  const html = await loadAsset(MHT_HTML_STATIC, "demo/mht-portal.html");
  if (!html) return c.html('<h1>MHT portal page not found</h1>', 404);
  return c.html(html);
});

// Demo index page
app.get('/', async (c) => {
  const html = await loadAsset(INDEX_HTML_STATIC, "demo/index.html");
  if (!html) return c.html(DEMO_HTML);
  return c.html(html);
});

const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Pluggable Bot Inline Fallback</h1>
  <script src="/widget/pluggable-bot.js"></script>
</body>
</html>`;

export default app;
