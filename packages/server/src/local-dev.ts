import { serve } from '@hono/node-server';
import app from './index.js';
import { env } from './env.js';

const port = env.port;
serve({ fetch: app.fetch, port }, () => {
  console.log(`pluggable-bot dev server running on http://localhost:${port}`);
});