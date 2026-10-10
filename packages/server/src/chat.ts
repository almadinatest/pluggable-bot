import type { Hono } from 'hono';
import OpenAI from 'openai';
import type { Bindings, ChatRequest, Message } from './types.js';
import { search } from './knowledge.js';

const enc = new TextEncoder();

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function chatRoute(app: Hono<{ Bindings: Bindings }>): void {
  app.post('/api/chat', async (c) => {
    let body: ChatRequest;
    try {
      body = await c.req.json<ChatRequest>();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }

    const { message, pageContext, history } = body;

    if (!message?.trim()) {
      return c.json({ error: 'message required' }, 400);
    }

    // Retrieve relevant knowledge chunks
    const contextChunks = search(message, 5);

    const knowledgeText =
      contextChunks.length > 0
        ? contextChunks.map((ch) => ch.content).join('\n---\n')
        : '(No knowledge base content yet. Use the Train Bot button to add content.)';

    const systemPrompt =
      `You are a helpful assistant for the website ${pageContext.url || '(unknown)'}. ` +
      `Use the following knowledge base excerpts to answer questions. ` +
      `If the answer is not in the knowledge base, say so.\n\n` +
      `Knowledge base:\n${knowledgeText}`;

    const safeHistory: Message[] = Array.isArray(history) ? history.slice(-10) : [];

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      {
        role: 'user',
        content: `${message}\n\n[Page: ${pageContext.title} ${pageContext.url}]`,
      },
    ];

    const apiKey = c.env?.OPENAI_API_KEY;

    if (apiKey) {
      // Real OpenAI streaming
      const openai = new OpenAI({ apiKey });
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        stream: true,
      });

      const readable = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content ?? '';
            if (token) {
              controller.enqueue(
                enc.encode('data: ' + JSON.stringify({ token }) + '\n\n')
              );
            }
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return sseResponse(readable);
    } else {
      // Mock streaming — word-by-word, no API key required
      const mockResponse =
        `I am a demo bot (no OpenAI API key configured). You asked: ${message}. ` +
        `Based on the knowledge base I found ${contextChunks.length} relevant chunk(s). ` +
        `To enable real AI responses, set OPENAI_API_KEY in packages/server/.dev.vars.`;

      const words = mockResponse.split(' ');

      const readable = new ReadableStream({
        async start(controller) {
          for (const word of words) {
            const token = word + ' ';
            controller.enqueue(
              enc.encode('data: ' + JSON.stringify({ token }) + '\n\n')
            );
            // 50ms delay between words
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return sseResponse(readable);
    }
  });
}
