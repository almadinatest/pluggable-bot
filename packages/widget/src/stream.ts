export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export async function streamSSE(
  url: string,
  body: unknown,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const reader = res.body!
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        callbacks.onDone();
        return;
      }

      buffer += value;

      // Split on double newline (SSE event boundary)
      const parts = buffer.split('\n\n');
      // Last part may be incomplete — keep it in the buffer
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              callbacks.onDone();
              return;
            }
            try {
              const parsed = JSON.parse(data) as { token: string };
              callbacks.onToken(parsed.token);
            } catch {
              // Malformed JSON line — skip
            }
          }
        }
      }
    }
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
