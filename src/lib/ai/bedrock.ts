import type { ChatMessage, StreamChunk } from '../../types';
import { SYSTEM_PROMPT } from './prompts';

export const BEDROCK_MODELS = [
  { id: 'anthropic.claude-opus-4-5-20251101-v1:0', label: 'Claude Opus 4.5 (Bedrock)' },
  { id: 'anthropic.claude-sonnet-4-5-20251101-v1:0', label: 'Claude Sonnet 4.5 (Bedrock)' },
  { id: 'anthropic.claude-haiku-3-5-20241022-v1:0', label: 'Claude Haiku 3.5 (Bedrock)' },
];

export const DEFAULT_BEDROCK_MODEL = 'anthropic.claude-sonnet-4-5-20251101-v1:0';

/**
 * Stream from AWS Bedrock (Anthropic Claude).
 *
 * Bedrock requires AWS SigV4 signing. Because the Cribl proxy strips the
 * standard `Authorization` header, we sign the request manually using the
 * AWS SDK (loaded lazily) and route the call through the platform proxy.
 *
 * The signed `Authorization` is passed in a custom header `x-cribl-aws-auth`
 * and the proxy renames it — OR the user can configure an API Gateway
 * endpoint with a static API key instead (see Settings > Bedrock mode).
 */
export async function* streamBedrock(
  messages: ChatMessage[],
  modelId: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke-with-response-stream`;

  const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: apiMessages,
  });

  // Lazily import SigV4 signer
  let signedHeaders: Record<string, string>;
  try {
    const { SignatureV4 } = await import('@smithy/signature-v4');
    const { Sha256 } = await import('@aws-crypto/sha256-js');

    const url = new URL(endpoint);
    const signer = new SignatureV4({
      credentials: { accessKeyId, secretAccessKey },
      region,
      service: 'bedrock',
      sha256: Sha256,
    });

    const request = await signer.sign({
      method: 'POST',
      protocol: 'https:',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        host: url.hostname,
      },
      body,
    });

    signedHeaders = request.headers as Record<string, string>;
  } catch (e) {
    yield { type: 'error', error: `SigV4 signing failed: ${String(e)}` };
    return;
  }

  // Pass the Authorization value in a custom header the proxy won't strip
  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  for (const [k, v] of Object.entries(signedHeaders)) {
    if (k.toLowerCase() === 'authorization') {
      fetchHeaders['x-cribl-aws-auth'] = v;
    } else if (k.toLowerCase() !== 'host') {
      fetchHeaders[k] = v;
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: fetchHeaders,
    body,
    signal,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    yield { type: 'error', error: `Bedrock error ${response.status}: ${err}` };
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
          };
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text ?? '' };
          } else if (event.type === 'message_stop') {
            yield { type: 'done' };
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: 'done' };
}
