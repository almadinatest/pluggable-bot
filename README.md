# Pluggable Bot

A lightweight, embeddable AI chat widget + Cloudflare Workers API server that you can drop into any website, train on its content, and use to answer visitor questions in real time.

---

## Quick Start

**Prerequisites:** Node.js 18+, npm 9+

```bash
# 1. Clone and install dependencies
git clone https://github.com/your-org/pluggable-bot.git
cd pluggable-bot
npm install

# 2. Build the widget
npm run build -w packages/widget
# Produces: packages/widget/dist/pluggable-bot.js

# 3. (Optional) Set your OpenAI API key for real AI responses
#    Without this key, the bot runs in demo/mock mode.
echo "OPENAI_API_KEY=sk-..." > packages/server/.dev.vars

# 4. Start the dev server
npm run dev -w packages/server
# Server starts at http://localhost:8787
```

Open **http://localhost:8787** in your browser. You'll see the Acme Analytics demo page with the chat widget in the bottom-right corner. Click **"🤖 Train Bot on This Page"** to index the page content, then ask the bot questions about it.

---

## Embed on Any Website

Add a single `<script>` tag before `</body>` — no API URL is hard-coded. If the page is served by the bot server, use same-origin relative URLs (`data-api-url=""`):

```html
<script
  src="/widget/pluggable-bot.js"
  data-api-url=""
  data-bot-name="My Bot"
  data-primary-color="#4f46e5"
  data-lang="ar"
></script>
```

If your API lives on another origin, point `data-api-url` at it directly (or set the `PUBLIC_API_URL` env var — the server substitutes `__API_URL__` placeholders in the demo pages it serves).

### Language (English / Arabic)

The widget ships with English and Arabic UI strings, full RTL layout, and a language-toggle button in its header. The bot also replies in the user's language (Arabic questions get Arabic answers).

- Omit `data-lang` to auto-detect from the host page (`<html lang>` / `dir="rtl"`) or the browser's preferred language.
- Set `data-lang="ar"` (or `"en"`) to force the initial language. Users can still toggle via the header button.
- `data-position` supports `bottom-right` (default), `bottom-left`, `top-right`, `top-left`.

### Mobile

The widget is built mobile-first:

- **Phones/tablets** — the panel opens as a full-screen sheet sized to the *visual* viewport, so the on-screen keyboard never covers the input; the launcher respects notch/safe-area insets.
- **Desktop (≥480px)** — it's the floating 380×520 card anchored per `data-position`.
- The message input is 16px on mobile (prevents iOS zoom-on-focus), touch targets are ≥44px, hover affordances only apply to real pointers, and long words/URLs wrap instead of overflowing.

For safe-area insets on notched devices, add `viewport-fit=cover` to your page's viewport meta:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

---

## Plug the Bot onto Any Web Link

Two built-in pages let you attach the bot to **any** URL — no code needed:

### Viewer — `/view?url=…`

Load any link with the bot attached and trained on it:

```
https://your-server/view?url=https%3A%2F%2Fexample.com
```

- Shows the site in an iframe with the chat widget overlaid, and automatically trains the bot on that link (fetched server-side, so cross-origin pages work).
- Three modes: **Site** (direct iframe), **Proxy** (server-side HTML proxy for sites that refuse to be framed — `X-Frame-Options` / CSP `frame-ancestors`), **Reader** (extracted text; no iframe at all). Pass `?mode=proxy` or `?mode=reader` to preselect one.
- The top bar lets you re-paste a new link, switch modes, or open the original page in a new tab.

### Landing page — `/plug`

`/plug` is a small installer page that gives you three options:

1. **Open a link in the viewer** — paste a URL, it jumps to `/view?url=…`.
2. **Bookmarklet** — drag the "🤖 Plug Bot" button to your bookmarks bar, then click it on any site you're browsing. It injects the widget into that page and trains the bot on the page text — works even on sites that block embedding.
3. **Embed snippet** — copy the ready-made `<script>` tag for any site you control.

### Direct URL training

`POST /api/train` now accepts a URL **without** `content` and fetches it server-side:

```bash
curl -X POST https://your-server/api/train \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com" }'
```

The fetch is guarded against SSRF: only `http(s)` targets are allowed, and localhost / private / link-local addresses are rejected.

The proxy endpoint (`/view` → **Proxy** tab, or `GET /proxy?url=…`) does the same guard, then rewrites the page: it injects a `<base>` so its CSS/JS/images load from the real site, routes same-site links, forms and stylesheets through `/proxy`, and serves it from our origin — so the target's framing policy never applies.

To keep the browser console clean, the proxy also:

- **drops the Blazor bootstrap script** (`_framework/blazor.web.js`). Its SignalR circuit can only connect same-origin, so cross-origin it just logged CORS errors and showed the "An error has occurred" toast;
- **routes stylesheets through `/proxy`** and rewrites their `url(...)` font/image references to same-origin requests, so the target's fonts no longer fail CORS;
- **passes binary resources (fonts, images) through untouched**, and hides the (now inert) Blazor error UI.

Interactive features that need cookies, websockets or Blazor interactivity (logins, dynamic forms) still will not work through the proxy.

---

## Training Your Bot

The bot answers questions based on content you train it on. You can train it in two ways:

### 1. Browser "Train Bot" button

The included `demo/index.html` has a sticky **"Train Bot on This Page"** button. Clicking it sends the full visible text of the page to `/api/train` automatically.

### 2. cURL / API

```bash
curl -X POST http://localhost:8787/api/train \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/pricing",
    "title": "Pricing Page",
    "content": "Free plan is $0/mo. Pro plan is $29/mo. Enterprise is $99/mo..."
  }'
```

Response:
```json
{ "chunksAdded": 3, "total": 3 }
```

The server splits long content into overlapping ~500-character chunks and ranks them for each query with an **Arabic-aware TF-IDF** scorer, feeding the top-5 matches as context into the AI prompt. The scorer normalizes Arabic orthography (diacritics, alef/yaa/taa-marbuta variants, the definite article) and applies light English stemming (license/licensing/licenses, renewal/renew) so spelling variants still match, then boosts chunks whose **title/name** matches and rewards broader query coverage.

### Bilingual (English + Arabic) crawling

`crawlSite()` accepts a list of locales. The MHT ePortal renders in Arabic when it receives its culture cookie, so `npm run crawl` fetches the catalogue in **both** languages and merges the results by service URL into bilingual records:

```ts
const locales = [
  { code: 'en' },
  { code: 'ar', headers: { Cookie: '.AspNetCore.Culture=c=ar-OM|uic=ar-OM' } },
];
await crawlSite('https://stg-eportal.mht.gov.om/', { locales });
```

Each service then carries its English **and** Arabic name, category and group, so an Arabic question such as «كيف أجدد رخصة مرشد سياحي؟» resolves to the correct service (`INV_LIC_S_021`).

### 3. Crawl a whole site

`POST /api/crawl` crawls a site and indexes all of its text:

```bash
curl -X POST https://your-server/api/crawl \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://stg-eportal.mht.gov.om/", "maxPages": 120 }'
# → { "pages": 65, "services": 37, "chunksAdded": 100, "total": 115 }
```

It follows same-origin links, extracts each page's text, and (for the MHT ePortal) parses the full eServices catalogue — every group, category and service — from the landing page. Pass multiple locales to crawl bilingually (see below).

### 4. Bake a site snapshot into the build (recommended for serverless)

Serverless instances have no writable disk and reset on cold starts, so instead of crawling at request time the MHT ePortal is **pre-crawled at build time** and merged into the seed:

```bash
npm run crawl        # → data/mht-crawl.json  (committed)
npm run build        # inlines it into the bundle (scripts/generate-assets.mjs)
```

`seedMhtKnowledge()` then loads the curated bilingual (EN/AR) seed **plus** the baked bilingual catalogue, so the deployed bot already knows all 37 eServices (in English and Arabic) without any runtime setup. Re-run `npm run crawl` + redeploy whenever the portal changes.

> Note: the MHT ePortal is a Blazor Server app — individual `/service/*` pages render client-side behind a login, so only the landing-page catalogue and the sign-in page expose text server-side. Service records are therefore synthesised from the catalogue (name, group, category, URL).

---

## Configuration

Widget defaults are baked from build-time env (see `WIDGET_*` below) and can be overridden per embed via `data-*` attributes on the `<script>` tag:

| Attribute            | Default                | Description                                        |
|----------------------|------------------------|----------------------------------------------------|
| `data-api-url`       | same-origin (`""`)     | Base URL of your pluggable-bot server              |
| `data-bot-name`      | `Bot` (or `WIDGET_BOT_NAME`) | Display name shown in the chat header         |
| `data-primary-color` | `#1a1a2e` (or `WIDGET_PRIMARY_COLOR`) | Accent color for launcher/send button |
| `data-lang`          | auto (`en`)            | UI language: `en` or `ar` (RTL + toggle)           |
| `data-position`      | `bottom-right` (or `WIDGET_POSITION`) | `bottom-right`, `bottom-left`, `top-right`, `top-left` |

Server configuration — everything is read from the environment (`.env.local` for local dev via `dotenv`, Vercel project env vars / Wrangler secrets for production). See `.env.example` for the full annotated list:

| Variable               | Default | Description                                            |
|------------------------|---------|--------------------------------------------------------|
| `OPENROUTER_API_KEY`   | `""`    | OpenRouter key (free). If empty, the bot runs in mock mode. |
| `OPENAI_API_KEY`       | `""`    | Legacy fallback key, used only if the OpenRouter one is unset. |
| `LLM_MODEL`            | `openrouter/auto` | Model to use for chat.                          |
| `OPENROUTER_BASE_URL`  | `https://openrouter.ai/api/v1` | Override the LLM endpoint.             |
| `PORT`                 | `8787`  | Local dev server port.                               |
| `CORS_ORIGIN`          | `*`     | Allowed CORS origin.                                 |
| `PUBLIC_API_URL`       | `""`    | Public API base URL injected into served demo pages (`__API_URL__` placeholder). Empty = same origin. |
| `DATA_DIR`             | `data`  | Directory for the on-disk knowledge store.           |
| `RAG_TOP_K`            | `5`     | How many chunks are injected as context per query.   |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `500` / `50` | Knowledge chunking settings.        |
| `MAX_HISTORY`          | `10`    | How many prior turns are sent to the model.          |
| `WIDGET_*`             | various | Widget bundle-time defaults (API URL, name, color, position, context limit, history). |

---

## Architecture

```
Browser
  └─ <script> tag loads widget JS from /widget/pluggable-bot.js
       └─ Custom Element (pluggable-bot) renders chat UI in Shadow DOM
            └─ User types message → POST /api/chat (SSE stream)
                 └─ Cloudflare Worker (Hono)
                      ├─ search() — TF-IDF over in-memory knowledge store
                      ├─ builds OpenAI prompt with top-5 context chunks
                      └─ streams response tokens as SSE data: {token} events
                           ending with data: [DONE]
```

- **Widget** (`packages/widget/`) — Vanilla TypeScript Custom Element compiled to a single IIFE JS file by esbuild. Zero dependencies at runtime.
- **Server** (`packages/server/`) — [Hono](https://hono.dev/) app running on Cloudflare Workers. Routes: `GET /`, `GET /plug`, `GET /view`, `GET /api/health`, `GET /api/reader`, `GET/POST /proxy`, `GET /widget/pluggable-bot.js`, `POST /api/train`, `POST /api/crawl`, `POST /api/chat`.
- **Knowledge store** — In-memory array of text chunks, seeded from the curated MHT content + the baked site snapshot (`data/mht-crawl.json`). Persisted to `packages/server/data/knowledge.json` under `wrangler dev` (Node.js compat). In production Workers, the store resets each cold start (suitable for demos; production workloads should use Cloudflare D1 or KV), but the baked seed is always re-applied.
- **Crawler** (`packages/server/src/crawl.ts`) — SSRF-guarded site crawler + MHT catalogue parser. Used by `POST /api/crawl` at runtime and by `scripts/crawl-mht.ts` at build time.
- **Streaming** — Server returns `text/event-stream` using the Workers `ReadableStream` API. Widget reads chunks via `fetch` + `TextDecoderStream` reader.

---

## Development

```bash
# Type-check the server (no emit)
npx tsc --noEmit -p packages/server/tsconfig.json

# Start wrangler dev (hot reload)
npm run dev -w packages/server

# Rebuild the widget after changes
npm run build -w packages/widget

# Watch widget source for changes
cd packages/widget && npx esbuild src/index.ts --bundle --format=iife --global-name=PluggableBotLoader --outfile=dist/pluggable-bot.js --watch
```

---

## Project Structure

```
pluggable-bot/
├── packages/
│   ├── widget/             # Vanilla TS Custom Element
│   │   ├── src/
│   │   │   ├── index.ts    # Entry — registers <pluggable-bot>
│   │   │   ├── widget.ts   # Custom Element logic
│   │   │   ├── stream.ts   # SSE fetch helper
│   │   │   ├── context.ts  # Page context extractor
│   │   │   └── styles.ts   # Shadow DOM CSS
│   │   └── dist/
│   │       └── pluggable-bot.js   # Built output (gitignored)
│   └── server/             # Hono + Cloudflare Workers API
│       ├── src/
│       │   ├── types.ts    # Shared TypeScript interfaces
│       │   ├── knowledge.ts # TF-IDF search + chunk store
│       │   ├── extract.ts  # Server-side URL fetch + HTML→text (SSRF-guarded)
│       │   ├── crawl.ts    # Site crawler + MHT eServices catalogue parser
│       │   ├── proxy.ts    # HTML proxy rewrite for sites that block framing
│       │   ├── train.ts    # POST /api/train handler (content or URL)
│       │   ├── chat.ts     # POST /api/chat handler (SSE)
│       │   └── index.ts    # Hono app entrypoint
│       ├── data/           # Runtime knowledge store (gitignored)
│       └── wrangler.toml   # Cloudflare Workers config
├── demo/
│   ├── index.html          # Standalone demo page (Acme Analytics)
│   ├── mht-portal.html     # MHT ePortal bilingual demo
│   ├── plug.html           # /plug — viewer link, bookmarklet, embed snippet
│   └── view.html           # /view — view any URL with the bot attached
├── scripts/
│   ├── generate-assets.mjs # Inlines HTML/widget/crawl-snapshot into assets.generated.ts
│   └── crawl-mht.ts        # Build-time crawl → data/mht-crawl.json
├── data/
│   └── mht-crawl.json      # Baked MHT ePortal snapshot (committed; `npm run crawl`)
└── README.md
```

---

## License

MIT
