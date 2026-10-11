//import { handle } from '@hono/node-server/vercel';
//import app from '../packages/server/src/index.js';

//export const config = { runtime: 'nodejs' };
//export default handle(app);

import { handle } from '@hono/node-server/vercel';
export const config = { runtime: 'nodejs' };

export default async (req: any, res: any) => {
  // Dynamically import the ESM server package
  const { default: app } = await import('../packages/server/src/index.js');
  
  // Pass the request and response to the Hono handler
  const handler = handle(app);
  return handler(req, res);
};
