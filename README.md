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

---

## Plug the Bot onto Any Web Link

Two built-in pages let you attach the bot to **any** URL — no code needed:

### Viewer — `/view?url=…`

Load any link with the bot attached and trained on it:

```
https://your-server/view?url=https%3A%2F%2Fexample.com
```

- Shows the site in an iframe with the chat widget overlaid, and automatically trains the bot on that link (fetched server-side, so cross-origin pages work).
- **Reader** tab shows the extracted text for sites that block being framed (`X-Frame-Options` / CSP) — it uses `GET /api/reader?url=…`.
- The top bar lets you re-paste a new link, switch Site/Reader, or open the original page in a new tab.

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

The server splits long content into overlapping ~500-character chunks, scores them with TF-IDF for each query, and feeds the top-5 matches as context into the AI prompt.

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
- **Server** (`packages/server/`) — [Hono](https://hono.dev/) app running on Cloudflare Workers. Routes: `GET /`, `GET /plug`, `GET /view`, `GET /api/health`, `GET /api/reader`, `GET /widget/pluggable-bot.js`, `POST /api/train`, `POST /api/chat`.
- **Knowledge store** — In-memory array of text chunks. Persisted to `packages/server/data/knowledge.json` under `wrangler dev` (Node.js compat). In production Workers, the store resets each cold start (suitable for demos; production workloads should use Cloudflare D1 or KV).
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
└── README.md
```

---

## License

MIT
