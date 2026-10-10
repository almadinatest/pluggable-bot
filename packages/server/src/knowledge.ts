import type { KnowledgeChunk } from './types.js';

// In-memory store — populated at startup from disk (wrangler dev only) and by /api/train
let chunks: KnowledgeChunk[] = [];

type FsModule = {
  readFile: (path: string, enc: string) => Promise<string>;
  mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
  writeFile: (path: string, data: string, enc: string) => Promise<void>;
};

/**
 * Try to load node:fs/promises via a standard dynamic import.
 * Works under wrangler dev (nodejs_compat); throws in prod Workers — caught below.
 */
// Try to seed from disk on module init (only works under wrangler dev with nodejs_compat)
try {
  // @ts-ignore — node:fs/promises is not in @cloudflare/workers-types but is available under nodejs_compat
  const fs = await import('node:fs/promises') as FsModule;
  const raw = await fs.readFile('data/knowledge.json', 'utf8');
  const parsed = JSON.parse(raw) as KnowledgeChunk[];
  if (Array.isArray(parsed)) {
    chunks = parsed;
  }
} catch {
  // Not available in prod Workers or file doesn't exist yet — start empty
}

/** Persist current chunks to disk (best-effort, silently ignored in prod). */
async function persist(): Promise<void> {
  try {
    // @ts-ignore — node:fs/promises is not in @cloudflare/workers-types but is available under nodejs_compat
    const fs = await import('node:fs/promises') as FsModule;
    await fs.mkdir('data', { recursive: true });
    await fs.writeFile('data/knowledge.json', JSON.stringify(chunks, null, 2), 'utf8');
  } catch {
    // Ignore — expected to fail in Cloudflare Workers prod
  }
}

/** Add new chunks to the store, replacing any with the same id. */
export function addChunks(newChunks: KnowledgeChunk[]): void {
  const existingIds = new Set(chunks.map((c) => c.id));
  for (const chunk of newChunks) {
    if (existingIds.has(chunk.id)) {
      const idx = chunks.findIndex((c) => c.id === chunk.id);
      if (idx !== -1) chunks[idx] = chunk;
    } else {
      chunks.push(chunk);
    }
  }
  // Fire-and-forget persist
  void persist();
}

/** Return the current chunk count. */
export function getChunkCount(): number {
  return chunks.length;
}

/** Tokenize a string into lowercase words. */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

/**
 * TF-IDF search — returns topK chunks ranked by relevance to query.
 */
export function search(query: string, topK = 5): KnowledgeChunk[] {
  if (chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return chunks.slice(0, topK);

  const N = chunks.length;

  // Document frequency: how many chunks contain each token
  const df: Record<string, number> = {};
  for (const chunk of chunks) {
    const chunkTokens = new Set(tokenize(chunk.content + ' ' + chunk.title));
    for (const token of chunkTokens) {
      df[token] = (df[token] ?? 0) + 1;
    }
  }

  // Score each chunk
  const scored = chunks.map((chunk) => {
    const chunkTokens = tokenize(chunk.content + ' ' + chunk.title);
    const termFreq: Record<string, number> = {};
    for (const t of chunkTokens) {
      termFreq[t] = (termFreq[t] ?? 0) + 1;
    }

    let score = 0;
    for (const token of queryTokens) {
      const tf = (termFreq[token] ?? 0) / (chunkTokens.length || 1);
      const idf = Math.log(1 + N / (1 + (df[token] ?? 0)));
      score += tf * idf;
    }

    return { ...chunk, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, topK);
}

/**
 * Split a long content string into overlapping ~500-char chunks.
 */
export function splitIntoChunks(
  content: string,
  title: string,
  url: string
): KnowledgeChunk[] {
  const chunkSize = 500;
  const overlap = 50;
  const result: KnowledgeChunk[] = [];

  // Normalize whitespace
  const text = content.replace(/\s+/g, ' ').trim();

  if (text.length === 0) return result;

  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkContent = text.slice(start, end);
    const id = `${url || title}-chunk-${index}`.replace(/[^a-zA-Z0-9-_]/g, '_');

    result.push({
      id,
      title,
      content: chunkContent,
      url,
    });

    index++;
    if (end >= text.length) break;
    start = end - overlap;
  }

  return result;
}
