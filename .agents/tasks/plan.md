# Implementation Plan — pluggable-bot

> Authoritative plan for the pluggable-bot monorepo.  
> FEAT artifacts under `.agents/tasks/task-pluggable-bot/` drive the workflow steps.  
> The plan below is the human-readable equivalent; the FEAT JSONs are the machine-readable form.

---

## Architecture decisions

**Widget as Custom Element with Shadow DOM.** Using a native `<pluggable-bot-widget>` Custom Element keeps the widget self-contained (no CSS bleed-in or bleed-out) and requires zero framework overhead. Shadow DOM is the idiomatic approach for embeddable widgets.

**esbuild IIFE bundle.** esbuild produces the smallest, fastest builds for vanilla TS. IIFE format with `globalName` lets the bundle self-register the Custom Element on load without any module system on the host page.

**Hono on Cloudflare Workers + `@hono/node-server` for local dev.** Hono's `fetch`-handler export works natively on Workers; `@hono/node-server` wraps it for plain `node` execution without wrangler when desired. Primary local dev uses `wrangler dev` (Workers runtime, not Node.js), which gives accurate streaming behaviour.

**SSE streaming via ReadableStream / TransformStream.** Workers' streaming is built on Web Streams, not Node.js streams. The `text/event-stream` response is constructed with a `ReadableStream` whose controller enqueues SSE-formatted chunks. This is the only pattern that works correctly on both Workers and Node.js.

**In-memory knowledge store serialised to `data/knowledge.json`.** For the demo scope, a simple JSON file persisted on every write is sufficient and avoids any DB dependency. TF-IDF scoring is implemented inline with no external library.

**OpenAI `gpt-4o-mini` with mock fallback.** The server detects `process.env.OPENAI_API_KEY` (or `env.OPENAI_API_KEY` in Workers binding). When absent it emits a synthetic streaming response so the demo works without credentials.

**npm workspaces root.** Both packages share one `node_modules` at the root, keeping installs simple on Windows.

---

## FEAT breakdown

This task decomposes into **three separable features** executed sequentially:

| # | FEAT | Summary |
|---|------|---------|
| 1 | FEAT-001 | Monorepo scaffold — root package.json, tsconfigs, wrangler.toml, empty src stubs |
| 2 | FEAT-002 | Widget package — full implementation of `packages/widget` + esbuild pipeline |
| 3 | FEAT-003 | Server package + demo page — full implementation of `packages/server` + `demo/index.html` |

---

## Ordered implementation steps (full detail)

### FEAT-001 — Monorepo scaffold

- [ ] 1. Create root `package.json` with `workspaces: ["packages/*"]` and root-level dev scripts.
      Files: `package.json`
      Verify: `npm install` from root installs without error; `npm run build` script exists.

- [ ] 2. Create `packages/widget/package.json` — pinned deps: `esbuild@0.28.2`, `typescript@7.0.2`; no runtime deps.
      Files: `packages/widget/package.json`
      Verify: `npm install` from root hoists esbuild and typescript.

- [ ] 3. Create `packages/server/package.json` — pinned deps: `hono@4.13.13`, `openai@7.32.0`, `@hono/node-server@1.13.7` (runtime); dev: `wrangler@4.149.0`, `typescript@7.0.2`, `@cloudflare/workers-types@5.20261010.1`.
      Files: `packages/server/package.json`
      Verify: `npm install` from root resolves server deps.

- [ ] 4. Create `packages/widget/tsconfig.json` — `target: ES2020`, `module: ESNext`, `lib: ["DOM","ES2020"]`, `strict: true`, `outDir: dist`.
      Files: `packages/widget/tsconfig.json`
      Verify: `npx tsc --noEmit -p packages/widget/tsconfig.json` exits 0 on empty stubs.

- [ ] 5. Create `packages/server/tsconfig.json` — `target: ES2020`, `module: ESNext`, `lib: ["ES2020"]`, types include `@cloudflare/workers-types`, `strict: true`.
      Files: `packages/server/tsconfig.json`
      Verify: `npx tsc --noEmit -p packages/server/tsconfig.json` exits 0 on stubs.

- [ ] 6. Create `packages/server/wrangler.toml` — `name = "pluggable-bot"`, `main = "src/index.ts"`, `compatibility_date`, `[vars] OPENAI_API_KEY = ""`.
      Files: `packages/server/wrangler.toml`
      Verify: `npx wrangler whoami` does not error on config parse (run from `packages/server`).

- [ ] 7. Create `data/` placeholder in `packages/server/data/.gitkeep` and add `knowledge.json` to `.gitignore`.
      Files: `packages/server/data/.gitkeep`, root `.gitignore`
      Verify: directory exists, `.gitignore` present.

---

### FEAT-002 — Widget package

- [ ] 8. Implement `packages/widget/src/styles.ts` — exports a single `const STYLES: string` with all widget CSS (launcher button, chat panel, header, messages, input row, typing indicator, animations). No external file reads at runtime.
      Files: `packages/widget/src/styles.ts`
      Verify: TypeScript compiles (`npx tsc --noEmit -p packages/widget/tsconfig.json`).

- [ ] 9. Implement `packages/widget/src/context.ts` — exports `getPageContext(): PageContext` that reads `location.href`, `document.title`, and the first 2000 characters of `document.body.innerText`, returning `{ url, title, visibleText }`.
      Files: `packages/widget/src/context.ts`
      Verify: TypeScript compiles.

- [ ] 10. Implement `packages/widget/src/stream.ts` — exports `streamSSE(url, body, onToken, onDone, onError)` using `fetch` + `ReadableStream` + `TextDecoderStream`. Parses SSE `data:` lines, calls `onToken` per token, `onDone` on `[DONE]`, `onError` on network failure.
      Files: `packages/widget/src/stream.ts`
      Verify: TypeScript compiles.

- [ ] 11. Implement `packages/widget/src/widget.ts` — the full Custom Element class `PluggableBotWidget extends HTMLElement`. Reads config from the loader `<script>` tag's `data-*` attributes; attaches Shadow DOM; renders launcher button, chat panel, message list, input, send button; wires up streaming via `streamSSE`; handles open/close toggle; auto-scrolls; shows typing indicator on first token wait.
      Files: `packages/widget/src/widget.ts`
      Verify: TypeScript compiles.

- [ ] 12. Implement `packages/widget/src/index.ts` — imports `PluggableBotWidget` and calls `customElements.define('pluggable-bot-widget', PluggableBotWidget)`. This is the esbuild entry point.
      Files: `packages/widget/src/index.ts`
      Verify: TypeScript compiles.

- [ ] 13. Add build script to `packages/widget/package.json`: `"build": "esbuild src/index.ts --bundle --format=iife --global-name=PluggableBotLoader --minify --outfile=dist/pluggable-bot.js --target=es2020"`. Create `packages/widget/dist/.gitkeep`.
      Files: `packages/widget/package.json`, `packages/widget/dist/.gitkeep`
      Verify: `npm run build -w packages/widget` produces `dist/pluggable-bot.js` < 30 KB (gzip).

---

### FEAT-003 — Server package + demo page

- [ ] 14. Implement `packages/server/src/types.ts` — shared TypeScript interfaces: `Message`, `PageContext`, `KnowledgeChunk`, `ChatRequest`, `TrainRequest`.
      Files: `packages/server/src/types.ts`
      Verify: TypeScript compiles.

- [ ] 15. Implement `packages/server/src/knowledge.ts` — in-memory store backed by `data/knowledge.json`. Exports `addChunks(chunks: KnowledgeChunk[])`, `search(query: string, topK?: number): KnowledgeChunk[]`. TF-IDF scoring computed inline. Loads from file on startup; writes on every add.
      Files: `packages/server/src/knowledge.ts`
      Verify: TypeScript compiles.

- [ ] 16. Implement `packages/server/src/train.ts` — Hono route handler for `POST /api/train`. Accepts `{ url?, content?, title? }`. Splits content into ~500-char overlapping chunks, calls `addChunks`, returns `{ chunksAdded }` JSON.
      Files: `packages/server/src/train.ts`
      Verify: TypeScript compiles.

- [ ] 17. Implement `packages/server/src/chat.ts` — Hono route handler for `POST /api/chat`. Accepts `ChatRequest`. Calls `search` to get top 5 knowledge chunks, builds OpenAI messages array with system prompt + context + history + user message. If `OPENAI_API_KEY` is set, streams `gpt-4o-mini` via `openai.chat.completions.create({ stream: true })` and pipes through a `TransformStream` to SSE. If absent, streams a mock response word-by-word. Both paths return `text/event-stream` with `Transfer-Encoding: chunked` disabled (Workers don't support it).
      Files: `packages/server/src/chat.ts`
      Verify: TypeScript compiles.

- [ ] 18. Implement `packages/server/src/index.ts` — root Hono app. Registers `/api/chat`, `/api/train`, `/api/health` routes. Registers `GET /` to serve the built demo page HTML inline (reads from a static string, not the filesystem, so it works on Workers). Adds CORS middleware allowing all origins. Exports `default app` for Workers.
      Files: `packages/server/src/index.ts`
      Verify: `npx tsc --noEmit -p packages/server/tsconfig.json` exits 0.

- [ ] 19. Create `demo/index.html` — standalone HTML page with: product/FAQ/pricing sample content, a `<script>` embed tag pointing at `http://localhost:8787/widget/pluggable-bot.js` (served by the server for demo), a "Train on this page" button that POSTs `body.innerText` to `/api/train`, and usage instructions.
      Files: `demo/index.html`
      Verify: page opens in browser, widget script tag present.

- [ ] 20. Configure the server to also serve `packages/widget/dist/pluggable-bot.js` at `GET /widget/pluggable-bot.js` so the demo page can load the widget from the same origin. Serve it as a static string embedded at build time using an esbuild plugin or by reading it in the Worker's `fetch` handler.
      Files: `packages/server/src/index.ts` (update)
      Verify: `wrangler dev` starts; `curl http://localhost:8787/widget/pluggable-bot.js` returns JS.

- [ ] 21. Add `"dev": "wrangler dev --port 8787"` and `"build": "tsc --noEmit"` scripts to `packages/server/package.json`. Add root-level `"dev"` and `"build"` scripts that chain workspace commands.
      Files: `packages/server/package.json`, `package.json`
      Verify: `npm run dev -w packages/server` starts wrangler on port 8787.

- [ ] 22. Write `README.md` at the repo root. Sections: Quick Start (install, build widget, run server, open demo), Configuration (data-* attributes, wrangler.toml vars), Training API (curl examples), Architecture.
      Files: `README.md`
      Verify: file exists with all sections.

---

## Dependency version table (pinned)

| Package | Version |
|---------|---------|
| `hono` | `4.13.13` |
| `openai` | `7.32.0` |
| `@hono/node-server` | `1.13.7` (optional local dev adapter) |
| `wrangler` | `4.149.0` |
| `@cloudflare/workers-types` | `5.20261010.1` |
| `esbuild` | `0.28.2` |
| `typescript` | `7.0.2` |

---

## Key technical notes for implementer

### SSE streaming pattern (Workers-compatible)
```ts
// In chat.ts — return this Response:
return new Response(
  new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
      }
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    }
  }),
  { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
);
```

### Widget SSE consumer pattern
```ts
// In stream.ts — use fetch + getReader(), NOT EventSource (EventSource can't POST)
const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
```

### esbuild IIFE command
```
esbuild src/index.ts --bundle --format=iife --global-name=PluggableBotLoader --minify --outfile=dist/pluggable-bot.js --target=es2020
```
The IIFE wrapper means `customElements.define` runs immediately when the script loads.

### wrangler.toml (Workers v4 compatible)
```toml
name = "pluggable-bot"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
OPENAI_API_KEY = ""
```
Pass the real key via `wrangler dev --var OPENAI_API_KEY:sk-...` or add it to `.dev.vars`.

### Knowledge file path
Workers cannot write to the filesystem; `data/knowledge.json` is only written/read when running under Node.js via `@hono/node-server` or wrangler's local persistence. In Workers production, the store remains in-memory for the session.
