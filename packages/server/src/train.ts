import type { Hono } from 'hono';
import type { TrainRequest } from './types.js';
import { addChunks, getChunkCount, splitIntoChunks } from './knowledge.js';

export function trainRoute(app: Hono): void {
  app.post('/api/train', async (c) => {
    let body: TrainRequest;
    try {
      body = await c.req.json<TrainRequest>();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }

    const content = body.content ?? '';
    const title = body.title ?? body.url ?? 'Untitled';
    const url = body.url ?? '';

    if (!content.trim()) {
      return c.json({ error: 'content required' }, 400);
    }

    const newChunks = splitIntoChunks(content, title, url);
    addChunks(newChunks);

    return c.json({ chunksAdded: newChunks.length, total: getChunkCount() });
  });
}
