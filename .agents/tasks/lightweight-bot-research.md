# Lightweight Web Bot Research: Findings Report

> Research date: 2025 (sources from 2024–2026)
> Scope: lightweight web bots/chatbot frameworks, agentic patterns, embed approaches, best-in-class examples, and a proposed architecture for a page-specific agentic bot.

---

## Summary

The best approach for a pluggable, page-specific agentic bot in 2025 is a **vanilla-JS/Web Component widget** backed by a **thin edge function** (Cloudflare Workers or similar), using **RAG + LLM tool-calling** for content awareness, and adopting the emerging **WebMCP standard** so the bot can discover and drive page actions without any backend integration. The full client payload can be kept under 30–50 KB gzipped. No existing off-the-shelf platform threads all three of these needles simultaneously—the closest is **Persona.js** (open source, zero-framework, WebMCP-native), but it ships only the UI; the backend and RAG layer are still yours to build.

---

## 1. Lightweight Web Bot / Chatbot Framework Comparison

### 1.1 Framework Landscape (2024–2026)

Content was rephrased for compliance with licensing restrictions.

The chatbot framework space divides into three architectural camps ([fast.io, 2026](https://about.fast.io/resources/best-open-source-ai-chatbot-frameworks/)):

1. **Traditional NLU pipelines** – Rasa, DeepPavlov. Train intent classifiers offline; no LLM calls at inference. Full control over latency and data privacy, but brittle for off-script conversations.
2. **LLM-native builders** – Botpress, Flowise, Voiceflow, Typebot. Visual flow builders wired to LLMs. Fast to prototype; expensive to self-host at scale.
3. **Chat UI / widget libraries** – Open WebUI, Persona.js, GhostChat, helixml/chat-widget. These are pure frontend concerns — they handle rendering and streaming; the conversation intelligence is plugged in separately.

For a **page-specific bot**, only the third camp is truly relevant on the client side. Camps 1 and 2 live on the server.

### 1.2 Comparison Table

| Solution | Client Bundle (gzip) | Open Source | Self-hostable | Agentic (tool-calling) | WebMCP / DOM-aware | Embedding model |
|---|---|---|---|---|---|---|
| **Persona.js** | ~small (TypeScript → IIFE; targets < 30 KB) | ✅ MIT | ✅ (any SSE backend) | ✅ (WebMCP tools) | ✅ native | Script tag / npm |
| **GhostChat widget** | ~15 KB | ✅ MIT | ⚠️ (needs GhostChat API) | ❌ (live-chat only) | ❌ | Script tag |
| **Flowise embed** | ~100–200 KB (Solid.js build) | ✅ Apache-2.0 | ✅ (self-hosted Flowise) | ✅ (chains/agents) | ❌ | Script tag / web component |
| **helixml/chat-widget** | ~50–80 KB | ✅ MIT | ✅ | ✅ (OpenAI tools) | ❌ | React or browser lib |
| **Open Chat Widget** | Unknown | ✅ MIT | ✅ (your backend) | ✅ (MCP client) | ⚠️ (MCP) | Script tag |
| **Typebot embed** | ~80–120 KB | ✅ AGPL-3.0 | ✅ | ⚠️ (via integrations) | ❌ | Script tag / React / iframe |
| **Botpress webchat** | ~200–300 KB | ✅ MIT | ✅ | ✅ (actions/tools) | ❌ | Script tag |
| **Intercom widget** | ~200 KB+ | ❌ proprietary | ❌ | ✅ (Fin RAG) | ❌ | Script tag |
| **Tidio / Crisp** | ~140–200 KB | ❌ proprietary | ❌ | ⚠️ (limited) | ❌ | Script tag |
| **Kapa.ai** | Hosted embed | ❌ proprietary | ❌ | ✅ (docs RAG) | ❌ | Script tag |
| **Inkeep** | Hosted embed | ❌ proprietary | ❌ | ✅ (docs RAG) | ❌ | Script tag / React |
| **Mintlify Ask** | Hosted embed | ❌ proprietary | ❌ | ✅ (docs RAG) | ❌ | Script tag |

**Truly lightweight (< 50 KB gzipped client)**:
- GhostChat: ~15 KB — but only live-chat, no LLM ([GitHub](https://github.com/ghostchat-dev/widget))
- Persona.js: targets minimal initial bundle, TypeScript IIFE, zero framework dependencies ([persona-chat.dev](https://www.persona-chat.dev/))
- Custom vanilla-JS build: achievable with no bundler overhead

**Sources**: [fast.io framework overview](https://about.fast.io/resources/best-open-source-ai-chatbot-frameworks/), [GhostChat widget README](https://github.com/ghostchat-dev/widget), [Persona.js site](https://www.persona-chat.dev/), [helixml chat-widget](https://github.com/helixml/chat-widget), [Flowise embed docs](https://docs.flowiseai.com/using-flowise/embed).

---

## 2. Agentic Bot Patterns for Web Pages

### 2.1 What Makes a Bot "Agentic" on a Single Page

A page-embedded bot is considered agentic when it can ([rtrvr.ai, 2025](https://rover.rtrvr.ai/blog/four-architectures-website-ai-agents)):

1. **Read live page context** — URL, title, current DOM text, user's scroll position, visible section.
2. **Call tools** — functions that do something: search the page's knowledge base, fill a form, navigate, add to cart.
3. **Reason multi-step** — decide which tool to call and in what order, not just pattern-match to a canned reply.
4. **Maintain short-term memory** — conversation history within the session.

The key distinction from a classic chatbot: *classic bots can only talk; agentic bots can also act*.

### 2.2 Four Architectures for Page-Specific Bots

Content was rephrased for compliance with licensing restrictions. Based on research from [rtrvr.ai](https://rover.rtrvr.ai/blog/four-architectures-website-ai-agents):

| Architecture | How it works | Strengths | Weaknesses |
|---|---|---|---|
| **RAG-only** | Index page content in a vector DB; retrieve chunks, inject into LLM prompt | Low latency; grounded answers; no DOM access | Can only answer questions; cannot take actions |
| **API-tool agent** | LLM calls server-side tools (search, booking APIs, CRM) | Rich integrations | Separate backend surface to maintain; blind to live DOM state |
| **DOM-native / in-page** | Agent runs in-browser, reads live DOM, can click/type | Access to real user session and live state | Requires user trust; potential prompt-injection risk |
| **Hybrid RAG + tools** | RAG for Q&A, tool-calling for actions, page context via `window` / `document` | Best of both worlds | More complex to build |

**Recommended for a page-specific bot**: the **Hybrid RAG + tools** pattern. RAG grounds the LLM in the page's own content; tools let the bot navigate, fill forms, or trigger page events; page context (URL, title, visible text) is injected as a system prompt prefix.

### 2.3 Page Context Injection

The simplest way to make a bot page-aware is to inject a context block into every LLM request:

```json
{
  "page_url": "https://example.com/product/widget-pro",
  "page_title": "Widget Pro — Example Store",
  "visible_text_summary": "<extracted innerText truncated to 2000 chars>",
  "user_scroll_pct": 42
}
```

This requires zero DOM-automation risk and works with any LLM backend. A more advanced approach uses **WebMCP** to expose page tools structurally.

### 2.4 WebMCP — The Emerging Standard for Page Tool Discovery

[WebMCP](https://webmcp.dev/) is an open-source JS library (and emerging W3C proposal) that lets a page expose named tools on `document.modelContext`. An embedded agent widget discovers these tools and calls them with user approval. Persona.js is the first widget library built natively on this standard ([persona-chat.dev](https://www.persona-chat.dev/)).

Example: a product page registers `addToCart(productId)` on `document.modelContext`; the embedded bot can call it when the user says "buy this for me."

WebMCP is relevant to this project because the repo is named `pluggable-bot` — WebMCP is essentially the pluggable-tool contract between page and bot.

---

## 3. Embedding Approaches

### 3.1 Widget/iframe vs. Shadow DOM vs. Web Component

| Approach | Style isolation | DOM access | Performance | SEO | Recommended |
|---|---|---|---|---|---|
| **iframe** | Full (separate browsing context) | None (cross-origin blocked) | Extra HTTP request + parse | Indexed separately | ❌ for agentic (no DOM) |
| **Shadow DOM inject** | Scoped (shadow root) | Full (same origin) | Minimal overhead | Transparent | ✅ best balance |
| **Plain script inject** | None (global CSS collision) | Full | Minimal | Transparent | ⚠️ style leakage |
| **Custom Element (Web Component)** | Optional Shadow DOM | Full | Minimal | Transparent | ✅ most composable |

Persona.js uses Shadow DOM rendering with prefixed CSS to prevent style bleed ([persona-chat.dev](https://www.persona-chat.dev/)). This is the right pattern. GhostChat injects directly into `<body>` without Shadow DOM but keeps its CSS scoped by class prefixes ([GitHub](https://github.com/ghostchat-dev/widget)).

**Recommendation**: Use a Custom Element with Shadow DOM for maximum style isolation and DOM accessibility on the host page.

### 3.2 Streaming: SSE vs. WebSocket

| Transport | Best for | Notes |
|---|---|---|
| **SSE (Server-Sent Events)** | LLM token streaming (one-way, server → client) | Works through HTTP/2 multiplexing; simpler than WebSocket; supported by Cloudflare Workers, Vercel Edge, etc. |
| **WebSocket** | Real-time two-way (live-chat, collaboration) | Overkill for LLM streaming; requires WS upgrade at infra layer |
| **HTTP Streaming (fetch + ReadableStream)** | Same as SSE but lower level | Works everywhere; used by Vercel AI SDK |

**Recommendation**: SSE for LLM token streaming. All major edge runtimes support it. The Vercel AI SDK and Cloudflare Workers natively emit SSE. GhostChat uses WebSocket for human–human live chat — that is the exception, not the rule for LLM bots.

Sources: [Cloudflare AutoRAG blog](https://blog.cloudflare.com/introducing-autorag-on-cloudflare/), [GhostChat widget](https://github.com/ghostchat-dev/widget), [Persona.js](https://www.persona-chat.dev/).

---

## 4. Best-in-Class Examples

### 4.1 Documentation Bots

| Product | How it works | Embed pattern | Key insight |
|---|---|---|---|
| **Kapa.ai** | Indexes your docs, exposes a hosted RAG agent with citations back to source pages ([kapa.ai](https://www.kapa.ai/solutions/website-agent)) | Single `<script>` tag | Deployed in < 1 hour on any docs site (Mintlify, Docusaurus, GitBook) |
| **Inkeep** | Crawls and indexes docs with RAG; provides React/JS embed ([inkeep.com](https://inkeep.com/integrations/mintlify)) | npm package or JS snippet | Also offers embedded in-page chat (not just modal) |
| **Mintlify Ask** | AI assistant trained on the Mintlify site's own content; embeddable widget for use outside Mintlify ([mintlify.com](https://www.mintlify.com/docs/assistant/widget)) | JS snippet | Works in dashboards, marketing sites, support portals |

**Key pattern**: all three ingest your content at index time, not at request time. The bot answers from a curated knowledge base, not by crawling live pages.

### 4.2 Support / CX Bots

| Product | Architecture | Notable |
|---|---|---|
| **Intercom Fin** | Three-phase: refine query → RAG retrieval → LLM generate with validation ([intercom.com](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine)) | Optimizes for both high resolution rate and low hallucination simultaneously — the only major player to explicitly tackle this tradeoff |
| **Zendesk AI** | LLM-assisted ticket routing + RAG on help center | Deep CRM integration |
| **Chat Thing** | Widget + WebMCP: bot discovers page tools, drives them in conversation ([chatthing.ai](https://chatthing.ai/blog/chat-thing-webmcp-website-copilot)) | Early WebMCP adopter |

---

## 5. Recommended Stack and Proposed Architecture

### 5.1 Design Decisions

**Decision 1: Vanilla-JS + Custom Element with Shadow DOM for the widget**
Keeps the client payload under 30 KB, avoids framework version conflicts on host pages, and gives full DOM access for context reading. Follows the Persona.js pattern but built for this repo's specific needs.

**Decision 2: SSE streaming over a thin edge function**
Cloudflare Workers (or Vercel Edge Functions) are the lowest-friction backend: sub-50 ms cold start, free tier covers high traffic, native SSE support. No persistent server to manage. Matches the zero-infrastructure ethos implied by "pluggable-bot."

**Decision 3: Hybrid RAG + tool-calling agent**
RAG for answering questions about the specific page/product content. LLM tool-calling for actions (navigate, fill form, search). Page context (URL, title, visible text) injected as a system prompt prefix — no DOM automation risk.

**Decision 4: WebMCP for tool registration**
Adopt `document.modelContext` as the contract between the host page and the embedded bot. The page registers what the bot is allowed to do; the bot discovers and calls those tools with user approval. This is the pluggable design the repo name implies.

**Decision 5: OpenAI (or compatible) API as the LLM backend, with vector search for RAG**
Cloudflare Vectorize + Workers AI for an all-edge stack (zero external DB). Alternatively, any OpenAI-compatible endpoint. The abstraction layer makes it swappable.

### 5.2 Architecture Diagram (Text)

```
┌──────────────────────────────────────────────────────────┐
│  HOST PAGE (any site)                                     │
│                                                           │
│  <script src="pluggable-bot.js"></script>                 │
│                                                           │
│  document.modelContext.registerTool(...)   ←─ page code  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  <pluggable-bot-widget>  (Custom Element)           │ │
│  │   Shadow DOM                                        │ │
│  │   • Chat UI (vanilla JS)                            │ │
│  │   • SSE stream consumer                             │ │
│  │   • Page context collector                          │ │
│  │     (URL, title, innerText snippet)                 │ │
│  │   • WebMCP tool discovery & user-approval UI        │ │
│  └──────────────────┬──────────────────────────────────┘ │
└─────────────────────┼────────────────────────────────────┘
                      │ HTTPS POST (user message + page context)
                      ▼
┌──────────────────────────────────────────────────────────┐
│  EDGE FUNCTION  (Cloudflare Worker / Vercel Edge)        │
│                                                           │
│  1. Receive { message, pageContext, conversationHistory } │
│  2. Vector search on page-specific knowledge base        │
│     → top-K chunks appended to system prompt             │
│  3. Call LLM (OpenAI / Workers AI) with tool definitions │
│  4. If tool_call → execute server-side tool              │
│     OR return tool_call event to widget for client-side  │
│  5. Stream tokens back via SSE                            │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
  ┌───────────────┐       ┌────────────────────┐
  │ Vector DB     │       │ LLM API            │
  │ Cloudflare    │       │ (OpenAI / Workers  │
  │ Vectorize     │       │  AI / Anthropic)   │
  │ (page content │       └────────────────────┘
  │  embeddings)  │
  └───────────────┘
```

### 5.3 Component Breakdown

#### Client widget (`pluggable-bot.js` — target: < 30 KB gzip)

| Responsibility | Implementation |
|---|---|
| Mount/unmount | Custom Element `<pluggable-bot-widget>` with Shadow DOM |
| UI rendering | Vanilla JS DOM manipulation (no virtual DOM) |
| Page context | `window.location.href`, `document.title`, `document.body.innerText.slice(0, 2000)` on each message |
| Streaming | `fetch()` + `ReadableStream` / `EventSource` for SSE |
| Tool UI | Show pending tool call, confirm button, execute on approval |
| WebMCP | Discover `document.modelContext` tools; pass definitions to backend |
| Config | `data-*` attributes on the `<script>` tag or a JSON config object |

#### Edge function (`/api/chat`)

| Responsibility | Implementation |
|---|---|
| RAG retrieval | Embed user query → vector search → inject top-K chunks |
| Conversation | Maintain multi-turn history (sent from client) |
| LLM call | OpenAI chat completions with `stream: true` and `tools: [...]` |
| Tool routing | Client-side tools → return `tool_call` event to widget; server-side tools → execute inline |
| Auth | Optional API key header (never in client-side bundle) |

#### Knowledge ingestion (offline / on-deploy)

- Crawl or paste page content
- Chunk text, embed with `text-embedding-3-small` (or Workers AI equivalent)
- Upsert to Cloudflare Vectorize (or Pinecone, Supabase pgvector, etc.)

### 5.4 Suggested Implementation Plan (High Level)

1. **Widget skeleton** — Custom Element + Shadow DOM mount, floating launcher, chat panel (input + messages list). Pure TypeScript → single IIFE bundle.
2. **Page context collector** — On each send, snapshot URL, title, visible text, scroll position; attach to request body.
3. **SSE edge function** — `/api/chat` Worker: accept message + context, forward to LLM with system prompt, stream back.
4. **RAG layer** — Content ingestion script, Vectorize upsert, retrieval at request time, chunk injection into system prompt.
5. **Tool-calling + WebMCP** — Widget discovers `document.modelContext` tools, serializes definitions, sends with request; backend includes as LLM tool definitions; stream back `tool_call` events for client-side execution.
6. **Config & theming** — `data-*` attributes for API URL, bot name, color scheme, position (bottom-right, bottom-left, inline).
7. **Tests & bundling** — Vitest unit tests for context collector and tool dispatch; Rollup/esbuild for final IIFE < 30 KB.

---

## 6. Conclusions

1. **No off-the-shelf solution fully solves this**: existing heavyweight platforms (Botpress, Voiceflow, Intercom) are far above the 50 KB lightweight target and are not designed for single-page context injection. The closest open-source option is Persona.js, but it ships no backend or RAG layer.

2. **Vanilla JS + Shadow DOM is the right client architecture**: it achieves < 30 KB, works on any host page without framework conflicts, and preserves full DOM access for context collection. GhostChat proves 15 KB is achievable for a rich widget.

3. **WebMCP is the right pluggability contract**: it gives the page control over what the bot can do (tool whitelist) without backend changes. The spec is early (2025/2026) but already has reference implementations and a major widget library (Persona.js) supporting it.

4. **Edge + RAG is the right server architecture**: Cloudflare Workers + Vectorize provides a zero-server-management, globally distributed backend under 50 ms. No external DB subscription required for moderate scale.

5. **Intercom Fin's RAG architecture is the model for quality**: their three-phase pipeline (refine query → retrieve + inject → generate + validate) demonstrates how to reduce hallucination while maintaining high resolution rates. This pattern is reproducible with open LLMs and Cloudflare Vectorize.

---

## References

- [Persona.js — VanillaJS Agent UI Library](https://www.persona-chat.dev/)
- [runtypelabs/persona — GitHub](https://github.com/runtypelabs/persona)
- [GhostChat widget — GitHub](https://github.com/ghostchat-dev/widget)
- [Flowise embed docs](https://docs.flowiseai.com/using-flowise/embed)
- [helixml/chat-widget — GitHub](https://github.com/helixml/chat-widget)
- [Kapa.ai Website Agent](https://www.kapa.ai/solutions/website-agent)
- [Inkeep embedded chat](https://docs.inkeep.com/cloud/ui-components/js-snippet/in-page/embedded-chat)
- [Mintlify Ask widget](https://www.mintlify.com/docs/assistant/widget)
- [Intercom Fin AI Engine](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine)
- [Four Architectures for Website AI Agents — rtrvr.ai](https://rover.rtrvr.ai/blog/four-architectures-website-ai-agents)
- [Cloudflare AutoRAG announcement](https://blog.cloudflare.com/introducing-autorag-on-cloudflare/)
- [WebMCP standard — webmcp.dev](https://webmcp.dev/)
- [WebMCP — Google Chrome Labs explainer](https://googlechromelabs.github.io/webmcp-tools/demos/explainer/)
- [WebMCP paper — arXiv](https://arxiv.org/pdf/2508.09171)
- [Chat Thing + WebMCP copilot](https://chatthing.ai/blog/chat-thing-webmcp-website-copilot)
- [Best Open Source AI Chatbot Frameworks 2026 — fast.io](https://about.fast.io/resources/best-open-source-ai-chatbot-frameworks/)
- [Botpress vs Voiceflow comparison](https://botpress.com/blog/botpress-vs-voiceflow)
- [Flowise shutting down 2026 — Landbot](https://landbot.io/blog/flowise-alternatives)
- [Shadow DOM vs iframe — Hackernoon](https://hackernoon.com/shadow-dom-vs-iframes-which-one-actually-works)
- [Embeddable RAG Chatbot Widget Cloudflare Workers — GitHub](https://github.com/arnobt78/Embeddable-RAG-Chatbot-Widget--JavaScript-Cloudflare-Workers-FullStack)
- [Cloudflare Workers RAG Architecture](https://markaicode.com/architecture/cloudflare-workers-rag-architecture/)
