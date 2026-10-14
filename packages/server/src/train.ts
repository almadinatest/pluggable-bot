import type { Hono } from 'hono';
import type { TrainRequest } from './types.js';
import { addChunks, getChunkCount, splitIntoChunks } from './knowledge.js';
import { fetchUrlPage } from './extract.js';

export function trainRoute(app: Hono): void {
  app.post('/api/train', async (c) => {
    let body: TrainRequest;
    try {
      // Read as text and strip a UTF-8 BOM before parsing: some clients (e.g.
      // Windows tooling) prefix the body with one, which workerd rejects.
      body = JSON.parse((await c.req.text()).replace(/^\uFEFF/, '')) as TrainRequest;
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }

    const url = body.url ?? '';
    let content = body.content ?? '';
    let title = body.title ?? body.url ?? 'Untitled';

    // No content supplied but a URL is → fetch the page server-side and index it.
    // (Lets you train the bot on any link, including cross-origin pages.)
    if (!content.trim() && url) {
      try {
        const page = await fetchUrlPage(url);
        content = page.text;
        title = body.title ?? page.title;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: `failed to fetch URL: ${msg}` }, 400);
      }
    }

    if (!content.trim()) {
      return c.json({ error: 'content or url required' }, 400);
    }

    const newChunks = splitIntoChunks(content, title, url);
    addChunks(newChunks);

    return c.json({ chunksAdded: newChunks.length, total: getChunkCount() });
  });
}
