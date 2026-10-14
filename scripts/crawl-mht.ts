// scripts/crawl-mht.ts
//
// Crawls the MHT ePortal and writes a structured knowledge seed to
// `data/mht-crawl.json`, which the build inlines into the server bundle
// (see scripts/generate-assets.mjs + packages/server/src/knowledge.ts).
//
// Run with:  npx tsx scripts/crawl-mht.ts
// Override:  CRAWL_START=https://… CRAWL_MAX_PAGES=200

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlSite } from '../packages/server/src/crawl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const START = process.env.CRAWL_START ?? 'https://stg-eportal.mht.gov.om/';
const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES ?? '300');

// The MHT ePortal renders in Arabic when this culture cookie is sent — the
// language toggle is a Blazor-only feature, but the server honours the cookie.
const LOCALES = [
  { code: 'en' },
  { code: 'ar', headers: { Cookie: '.AspNetCore.Culture=c=ar-OM|uic=ar-OM' } },
];

async function main(): Promise<void> {
  const { pages, serviceCount, locales } = await crawlSite(START, {
    maxPages: MAX_PAGES,
    locales: LOCALES,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    startUrl: START,
    locales,
    serviceCount,
    pageCount: pages.length,
    pages,
  };

  mkdirSync(join(root, 'data'), { recursive: true });
  const target = join(root, 'data', 'mht-crawl.json');
  writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[crawl] wrote ${target}: ${pages.length} pages (${serviceCount} services)`);
}

main().catch((err) => {
  console.error('[crawl] failed:', err);
  process.exit(1);
});
