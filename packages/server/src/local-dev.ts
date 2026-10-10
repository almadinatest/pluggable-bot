import { serve } from '@hono/node-server';
import app from './index.js';

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`pluggable-bot dev server running on http://localhost:${port}`);
});
