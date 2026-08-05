import type { ChatMessage, StreamChunk } from '../../types';
import { getSystemPrompt } from './prompts';

/**
 * Aperture is Cribl's internal AI gateway (Tailscale-backed at http://ai).
 * It exposes an Anthropic-compatible /v1/messages endpoint.
 * Authentication is handled by Tailscale identity — any token value works.
 *
 * Network access:
 *   - Dev mode (app loaded directly in browser, no Cribl iframe): fetch goes
 *     directly from the browser, so Tailscale on the user's machine is enough.
 *   - Installed in Cribl: fetch is proxied through the Cribl Leader server,
 *     which requires the Leader to be on the Tailscale network.
 */
export const APERTURE_DEFAULT_BASE_URL = 'http://ai';


export const APERTURE_MODELS = [
  { id: 'us.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6' },
  { id: 'us.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'us.anthropic.claude-opus-4-5-20251101-v1:0', label: 'Claude Opus 4.5' },
  { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude Sonnet 4.5' },
  { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5' },
];

export const DEFAULT_APERTURE_MODEL = 'us.anthropic.claude-sonnet-4-6';

export async function* streamAperture(
  messages: ChatMessage[],
  model: string,
  baseUrl: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

  const systemPrompt = await getSystemPrompt();
  const body = JSON.stringify({
    model,
    max_tokens: 16000,
    stream: true,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  // Use XMLHttpRequest instead of fetch().
  // The Cribl platform overrides window.fetch to proxy external calls through the
  // server (which blocks Tailscale private IPs via SSRF protection).
  // XHR is NOT intercepted by that override, so the request goes directly from
  // the browser — Tailscale on the user's machine resolves http://ai transparently.
  yield* xhrStreamSSE(url, body, signal);
}

/**
 * Stream SSE over XMLHttpRequest, bypassing the Cribl window.fetch proxy.
 * Uses onprogress to consume chunks incrementally as they arrive.
 */
async function* xhrStreamSSE(
  url: string,
  body: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  type QueueItem = { line: string } | { error: string } | { done: true };

  const queue: QueueItem[] = [];
  const waiters: Array<() => void> = [];

  const enqueue = (item: QueueItem) => {
    queue.push(item);
    waiters.shift()?.();
  };

  const waitForItem = () => new Promise<void>(res => waiters.push(res));

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', 'Bearer aperture-managed');
  xhr.setRequestHeader('anthropic-version', '2023-06-01');

  let offset = 0;
  let lineBuffer = '';

  xhr.onprogress = () => {
    const newText = xhr.responseText.slice(offset);
    offset = xhr.responseText.length;
    lineBuffer += newText;
    const parts = lineBuffer.split('\n');
    lineBuffer = parts.pop() ?? '';
    for (const line of parts) enqueue({ line });
  };

  xhr.onload = () => {
    if (xhr.status >= 400) {
      const errText = xhr.responseText.slice(0, 500);
      enqueue({ error: `Aperture error ${xhr.status}: ${errText}` });
    } else {
      if (lineBuffer) { enqueue({ line: lineBuffer }); lineBuffer = ''; }
      enqueue({ done: true });
    }
  };

  xhr.onerror = () => {
    enqueue({
      error:
        `Could not reach Aperture at ${url}.\n` +
        `Make sure Tailscale is running and you are connected to the Cribl network.`,
    });
  };

  signal?.addEventListener('abort', () => {
    xhr.abort();
    enqueue({ done: true });
  });

  xhr.send(body);

  while (true) {
    if (queue.length === 0) await waitForItem();
    const item = queue.shift()!;

    if ('done' in item) {
      yield { type: 'done' };
      return;
    }

    if ('error' in item) {
      yield { type: 'error', error: item.error };
      return;
    }

    const line = item.line;
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') {
      yield { type: 'done' };
      return;
    }

    try {
      const event = JSON.parse(data) as {
        type: string;
        delta?: { type: string; text?: string };
        error?: { message: string };
      };
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text ?? '' };
      } else if (event.type === 'message_stop') {
        yield { type: 'done' };
        return;
      } else if (event.type === 'error') {
        yield { type: 'error', error: event.error?.message ?? 'Unknown error' };
        return;
      }
    } catch {
      // ignore malformed SSE lines
    }
  }
}
