// Central configuration — every tunable value is read from the environment
// with a safe default, so nothing deployment-specific is hard-coded.
//
// See `.env.example` (repo root) and `packages/server/.dev.vars.example` for docs.

/** Parse a numeric env var, falling back to `fallback` when missing/invalid. */
function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  // ── HTTP server ─────────────────────────────────────────────────────────────
  port: num(process.env.PORT, 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  // Public base URL used to render the demo pages. Empty string means
  // "same origin as the page" (relative URLs), which is correct on Vercel.
  publicApiUrl: (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''),

  // ── LLM provider (OpenAI-compatible; defaults to OpenRouter) ────────────────
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  llmModel: process.env.LLM_MODEL ?? 'openrouter/auto',
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  appTitle: process.env.APP_TITLE ?? 'Pluggable Bot',
  appUrl: process.env.APP_URL ?? 'https://github.com/pluggable-bot',
  maxHistory: num(process.env.MAX_HISTORY, 10),

  // ── Retrieval / knowledge store ─────────────────────────────────────────────
  ragTopK: num(process.env.RAG_TOP_K, 5),
  dataDir: process.env.DATA_DIR ?? 'data',
  chunkSize: num(process.env.CHUNK_SIZE, 500),
  chunkOverlap: num(process.env.CHUNK_OVERLAP, 50),

  // ── Static assets ───────────────────────────────────────────────────────────
  widgetCacheMaxAge: num(process.env.WIDGET_CACHE_MAX_AGE, 3600),
};

/** The API key to use — OpenRouter takes priority, then legacy OpenAI. */
export function getLlmApiKey(): string {
  return env.openrouterApiKey || env.openaiApiKey;
}
