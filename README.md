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

Add a single `<script>` tag before `</body>`:

```html
<script
  src="http://localhost:8787/widget/pluggable-bot.js"
  data-api-url="http://localhost:8787"
  data-bot-name="My Bot"
  data-primary-color="#4f46e5"
></script>
```

For production, replace `http://localhost:8787` with your deployed Worker URL.

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

Configure the widget via `data-*` attributes on the `<script>` tag:

| Attribute            | Default              | Description                                        |
|----------------------|----------------------|----------------------------------------------------|
| `data-api-url`       | `http://localhost:8787` | Base URL of your pluggable-bot server           |
| `data-bot-name`      | `Bot`                | Display name shown in the chat header              |
| `data-primary-color` | `#4f46e5`            | Accent color used for the launcher and send button |

Server configuration (`packages/server/.dev.vars` for local dev, Wrangler secrets for production):

| Variable         | Default | Description                                            |
|------------------|---------|--------------------------------------------------------|
| `OPENAI_API_KEY` | `""`    | OpenAI API key. If empty, the bot runs in mock mode.   |

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
- **Server** (`packages/server/`) — [Hono](https://hono.dev/) app running on Cloudflare Workers. Routes: `GET /`, `GET /api/health`, `GET /widget/pluggable-bot.js`, `POST /api/train`, `POST /api/chat`.
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
│       │   ├── train.ts    # POST /api/train handler
│       │   ├── chat.ts     # POST /api/chat handler (SSE)
│       │   └── index.ts    # Hono app entrypoint
│       ├── data/           # Runtime knowledge store (gitignored)
│       └── wrangler.toml   # Cloudflare Workers config
├── demo/
│   └── index.html          # Standalone demo page (Acme Analytics)
└── README.md
```

---

## License

MIT
