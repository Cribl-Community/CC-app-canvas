import type { ChatMessage, StreamChunk } from '../../types';
import { SYSTEM_PROMPT } from './prompts';

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-3-5', label: 'Claude Haiku 3.5' },
];

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Stream a response from Anthropic Claude.
 * The API key can be supplied directly (stored in localStorage via Settings)
 * or injected server-side by the Cribl proxy (proxies.yml kv.anthropic_api_key).
 * x-api-key is not in Cribl's stripped-headers list, so it passes through the proxy.
 */
export async function* streamAnthropic(
  messages: ChatMessage[],
  model: string,
  apiKey?: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const apiMessages: AnthropicMessage[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (apiKey) headers['x-api-key'] = apiKey;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: apiMessages,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    yield { type: 'error', error: `Anthropic API error ${response.status}: ${err}` };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

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
          } else if (event.type === 'error') {
            yield { type: 'error', error: event.error?.message ?? 'Unknown error' };
            return;
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: 'done' };
}
