import type { Hono } from 'hono';
import OpenAI from 'openai';
import type { ChatRequest, Message } from './types.js';
import { search } from './knowledge.js';

const enc = new TextEncoder();

// ── Defaults ──────────────────────────────────────────────────────────────────
// Free model list — verified October 2026 against openrouter.ai/models?q=:free
// Free models rotate without notice; the safest default is openrouter/auto which
// always picks an available free model automatically.
// Override with LLM_MODEL in packages/server/.dev.vars.
const FREE_MODELS = [
  'openrouter/auto',                                // ← always routes to an available free model
  'nvidia/nemotron-3-super-120b-a12b:free',         // 120B MoE — great for chat/agents
  'nvidia/nemotron-3.5-lightning:free',             // 1M context — fast responses
  'qwen/qwen3.8-27b:free',                          // 27B — strong multilingual chat
  'poolside/laguna-s-2.1:free',                     // highest-traffic free model
];

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const APP_TITLE       = 'Pluggable Bot';
const APP_URL         = 'https://github.com/pluggable-bot';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function buildClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE,
    defaultHeaders: {
      'HTTP-Referer': APP_URL,
      'X-Title':      APP_TITLE,
    },
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────
export function chatRoute(app: Hono): void {
  app.post('/api/chat', async (c) => {
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: ChatRequest;
    try {
      body = await c.req.json<ChatRequest>();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }

    const { message, pageContext, history } = body;
    if (!message?.trim()) return c.json({ error: 'message required' }, 400);

    // ── RAG: retrieve relevant knowledge chunks ───────────────────────────────
    const contextChunks = search(message, 5);
    const knowledgeText =
      contextChunks.length > 0
        ? contextChunks.map((ch) => ch.content).join('\n---\n')
        : '(No knowledge base content yet — use the Train Bot button to add content.)';

    const systemPrompt =
      `You are a helpful assistant for the website: ${pageContext.url || '(unknown)'}.\n` +
      `Answer questions using the knowledge base below. Be concise and accurate.\n` +
      `If the answer isn't in the knowledge base, say so clearly.\n\n` +
      `Knowledge base:\n${knowledgeText}`;

    const safeHistory: Message[] = Array.isArray(history) ? history.slice(-10) : [];

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      {
        role: 'user',
        content: `${message}\n\n[Page context: ${pageContext.title} — ${pageContext.url}]`,
      },
    ];

    // ── Resolve API key: prefer OPENROUTER_API_KEY, fall back to OPENAI_API_KEY
    // (OpenRouter accepts the same key format for both fields.)
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

    // ── LLM: real streaming via OpenRouter ────────────────────────────────────
    if (apiKey) {
      const model = process.env.LLM_MODEL || FREE_MODELS[0];
      const client = buildClient(apiKey);

      const readable = new ReadableStream({
        async start(controller) {
          try {
            const stream = await client.chat.completions.create({
              model,
              messages,
              stream: true as const,
            });

            for await (const chunk of stream) {
              const token = chunk.choices[0]?.delta?.content ?? '';
              if (token) {
                controller.enqueue(
                  enc.encode('data: ' + JSON.stringify({ token }) + '\n\n')
                );
              }
            }
          } catch (err) {
            // Surface the error as a streamed message so the user sees it
            const msg = err instanceof Error ? err.message : String(err);
            controller.enqueue(
              enc.encode('data: ' + JSON.stringify({ token: `\n\n⚠️ LLM error: ${msg}` }) + '\n\n')
            );
          } finally {
            controller.enqueue(enc.encode('data: [DONE]\n\n'));
            controller.close();
          }
        },
      });

      return sseResponse(readable);
    }

    // ── Fallback: informative mock when no API key is configured ─────────────
    // Renders an actual answer from the knowledge base so the demo is still useful.
    let mockAnswer: string;
    if (contextChunks.length > 0) {
      const topChunk = contextChunks[0];
      mockAnswer =
        `Based on the knowledge base (demo mode — no API key):\n\n` +
        `**${topChunk.title}**\n${topChunk.content}\n\n` +
        `---\n_To enable real AI responses, add your free OpenRouter API key:_\n` +
        `_Create \`packages/server/.dev.vars\` with:_\n` +
        `\`OPENROUTER_API_KEY=sk-or-...\`\n` +
        `_Get a free key at [openrouter.ai](https://openrouter.ai) — no credit card needed._`;
    } else {
      mockAnswer =
        `Demo mode — no API key configured and no knowledge base content found.\n\n` +
        `Click **"Train Bot on This Page"** to add content, then ask again.\n\n` +
        `To enable real AI: add \`OPENROUTER_API_KEY=sk-or-...\` to \`packages/server/.dev.vars\`.\n` +
        `Get a free key at [openrouter.ai](https://openrouter.ai) — no credit card needed.`;
    }

    const words = mockAnswer.split(' ');
    const readable = new ReadableStream({
      async start(controller) {
        for (const word of words) {
          controller.enqueue(
            enc.encode('data: ' + JSON.stringify({ token: word + ' ' }) + '\n\n')
          );
          await new Promise<void>((r) => setTimeout(r, 30));
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return sseResponse(readable);
  });
}
