import type { ChatMessage, StreamChunk } from '../../types';
import { getSystemPrompt } from './prompts';

export const BEDROCK_MODELS = [
  { id: 'us.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6 (Bedrock)' },
  { id: 'us.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Bedrock)' },
  { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude Sonnet 4.5 (Bedrock)' },
  { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5 (Bedrock)' },
];

export const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-6';

function criblApiBase(): string {
  return (window as unknown as { CRIBL_API_URL?: string }).CRIBL_API_URL ?? '/api/v1';
}

/**
 * Write the SigV4 Authorization header value to KV so the Cribl proxy can inject it.
 *
 * The Cribl proxy always strips `Authorization` from outgoing requests (SSRF/auth
 * isolation). The workaround: store the per-request signed value at KV key
 * `bedrockAuth` immediately before the fetch, then let proxies.yml inject it via
 * `Authorization: kv.bedrockAuth`. Written as a raw string (no JSON.stringify) so
 * the proxy reads and injects the value verbatim.
 */
async function writeBedrockAuthToKv(authValue: string): Promise<void> {
  await fetch(`${criblApiBase()}/kvstore/bedrockAuth`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: authValue,
  });
}

/**
 * Stream from AWS Bedrock (Anthropic Claude).
 *
 * Bedrock requires AWS SigV4 signing. The Cribl proxy strips the standard
 * `Authorization` header from all outgoing requests. To work around this, we:
 *   1. Sign the request with SigV4 to obtain the Authorization value.
 *   2. Write that value to KV key `bedrockAuth` immediately before fetching.
 *   3. proxies.yml injects `Authorization: kv.bedrockAuth` on all Bedrock domains.
 * All other SigV4 headers (x-amz-date, x-amz-content-sha256) are forwarded as-is.
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
  const systemPrompt = await getSystemPrompt();
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 16000,
    system: systemPrompt,
    messages: apiMessages,
  });

  // Lazily import SigV4 signer
  let signedHeaders: Record<string, string>;
  try {
    const { SignatureV4 } = await import('@smithy/signature-v4');

    // @aws-crypto/sha256-js produces incorrect HMAC in certain browser
    // environments. Use the browser's native Web Crypto API instead.
    type SourceData = string | ArrayBuffer | ArrayBufferView;
    class WebCryptoSha256 {
      private key: Promise<CryptoKey> | null = null;
      private chunks: Uint8Array[] = [];
      constructor(secret?: SourceData) {
        if (secret !== undefined) {
          const raw: BufferSource =
            typeof secret === 'string' ? new TextEncoder().encode(secret)
            : ArrayBuffer.isView(secret) ? (secret as ArrayBufferView<ArrayBuffer>)
            : secret as ArrayBuffer;
          this.key = crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        }
      }
      update(data: SourceData): void {
        const bytes: Uint8Array =
          typeof data === 'string' ? new TextEncoder().encode(data)
          : ArrayBuffer.isView(data) ? new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength)
          : new Uint8Array(data as ArrayBuffer);
        this.chunks.push(bytes);
      }
      async digest(): Promise<Uint8Array> {
        const combined = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0;
        for (const c of this.chunks) { combined.set(c, offset); offset += c.length; }
        if (this.key) {
          const k = await this.key;
          return new Uint8Array(await crypto.subtle.sign('HMAC', k, combined));
        }
        return new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
      }
    }

    const url = new URL(endpoint);
    const signer = new SignatureV4({
      credentials: { accessKeyId, secretAccessKey },
      region,
      service: 'bedrock',
      sha256: WebCryptoSha256 as never,
      // url.pathname is already percent-encoded (e.g. %3A for ':' in the model ID).
      // uriEscapePath:true (default) would double-encode '%' → '%25', producing
      // '%253A' instead of '%3A' and a wrong canonical hash. Disable it so the
      // path is used as-is.
      uriEscapePath: false,
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

  // Write the Authorization value to KV so the proxy can inject it.
  // Must complete before the fetch — proxy reads KV at request time.
  const authKey = Object.keys(signedHeaders).find(k => k.toLowerCase() === 'authorization');
  const authValue = (authKey ? signedHeaders[authKey] : '') ?? '';
  try {
    await writeBedrockAuthToKv(authValue);
  } catch (e) {
    yield { type: 'error', error: `Bedrock: failed to write auth to KV: ${String(e)}` };
    return;
  }

  // Forward SigV4 headers (x-amz-date, x-amz-content-sha256, etc.) but NOT
  // Authorization or host — Authorization is injected by the proxy from KV.
  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  for (const [k, v] of Object.entries(signedHeaders)) {
    const lower = k.toLowerCase();
    if (lower === 'authorization' || lower === 'host') continue;
    fetchHeaders[k] = v;
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

  // Bedrock invoke-with-response-stream returns AWS binary EventStream frames, NOT SSE.
  // Frame layout: [4B total_len][4B headers_len][4B prelude_crc][headers…][payload JSON][4B msg_crc]
  // Payload is {"bytes":"base64..."} where atob(bytes) is the Anthropic-format event JSON.
  const dec = new TextDecoder();
  let buf = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        const tmp = new Uint8Array(buf.length + value.length);
        tmp.set(buf);
        tmp.set(value, buf.length);
        buf = tmp;
      }

      // Parse all complete EventStream frames present in the buffer
      while (buf.length >= 16) {
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const totalLen = view.getUint32(0, false); // big-endian
        if (totalLen < 16 || buf.length < totalLen) break;

        const headersLen = view.getUint32(4, false);
        const payloadStart = 12 + headersLen;
        const payloadEnd = totalLen - 4;

        if (payloadEnd > payloadStart) {
          const payloadText = dec.decode(buf.slice(payloadStart, payloadEnd));
          try {
            const envelope = JSON.parse(payloadText) as { bytes?: string; message?: string };
            if (envelope.bytes) {
              const eventText = atob(envelope.bytes);
              const event = JSON.parse(eventText) as {
                type: string;
                delta?: { type: string; text?: string };
              };
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                yield { type: 'text', text: event.delta.text ?? '' };
              } else if (event.type === 'message_stop') {
                yield { type: 'done' };
              }
            } else if (envelope.message) {
              yield { type: 'error', error: `Bedrock stream error: ${envelope.message}` };
              return;
            }
          } catch {
            // ignore malformed frames
          }
        }
        buf = buf.slice(totalLen);
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: 'done' };
}
