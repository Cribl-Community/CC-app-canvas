import type { ChatMessage, StreamChunk, ToolExecutor } from '../../types';
import { SYSTEM_PROMPT } from './prompts';
import { TOOL_DEFINITIONS } from './tools';

export const BEDROCK_MODELS = [
  { id: 'anthropic.claude-opus-4-5-20251101-v1:0', label: 'Claude Opus 4.5 (Bedrock)' },
  { id: 'anthropic.claude-sonnet-4-5-20251101-v1:0', label: 'Claude Sonnet 4.5 (Bedrock)' },
  { id: 'anthropic.claude-haiku-3-5-20241022-v1:0', label: 'Claude Haiku 3.5 (Bedrock)' },
];

export const DEFAULT_BEDROCK_MODEL = 'anthropic.claude-sonnet-4-5-20251101-v1:0';

const MAX_TOOL_ITERATIONS = 30;

type ApiTextBlock = { type: 'text'; text: string };
type ApiToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
type ApiToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string };
type ApiContentBlock = ApiTextBlock | ApiToolUseBlock | ApiToolResultBlock;
type ApiMessage = { role: 'user' | 'assistant'; content: string | ApiContentBlock[] };

/**
 * Stream from AWS Bedrock (Anthropic Claude) with tool-use agentic loop.
 *
 * Bedrock requires AWS SigV4 signing. Because the Cribl proxy strips the
 * standard `Authorization` header, we sign the request manually using the
 * AWS SDK (loaded lazily) and route the call through the platform proxy.
 *
 * The signed `Authorization` is passed in a custom header `x-cribl-aws-auth`
 * and the proxy renames it.
 */
export async function* streamBedrock(
  messages: ChatMessage[],
  modelId: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  signal?: AbortSignal,
  toolExecutor?: ToolExecutor,
): AsyncGenerator<StreamChunk> {
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke-with-response-stream`;

  const apiMessages: ApiMessage[] = messages.map(m => ({ role: m.role, content: m.content }));

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
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

    const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
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

    let textAccumulated = '';
    const toolUseBlocks: { id: string; name: string; input: string }[] = [];
    let currentTool: { id: string; name: string; input: string } | null = null;
    let stopReason = '';

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
              content_block?: { type: string; id?: string; name?: string };
              delta?: { type: string; text?: string; partial_json?: string; stop_reason?: string };
            };

            switch (event.type) {
              case 'content_block_start':
                if (event.content_block?.type === 'tool_use') {
                  currentTool = {
                    id: event.content_block.id ?? '',
                    name: event.content_block.name ?? '',
                    input: '',
                  };
                }
                break;

              case 'content_block_delta':
                if (event.delta?.type === 'text_delta' && event.delta.text) {
                  textAccumulated += event.delta.text;
                  yield { type: 'text', text: event.delta.text };
                } else if (event.delta?.type === 'input_json_delta' && currentTool) {
                  currentTool.input += event.delta.partial_json ?? '';
                }
                break;

              case 'content_block_stop':
                if (currentTool) {
                  toolUseBlocks.push(currentTool);
                  currentTool = null;
                }
                break;

              case 'message_delta':
                if (event.delta?.stop_reason) {
                  stopReason = event.delta.stop_reason;
                }
                break;
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const assistantContent: ApiContentBlock[] = [];
    if (textAccumulated) {
      assistantContent.push({ type: 'text', text: textAccumulated });
    }
    for (const tool of toolUseBlocks) {
      let parsedInput: Record<string, unknown> = {};
      try { parsedInput = JSON.parse(tool.input || '{}'); } catch { /* leave empty */ }
      assistantContent.push({ type: 'tool_use', id: tool.id, name: tool.name, input: parsedInput });
    }
    apiMessages.push({ role: 'assistant', content: assistantContent });

    if (stopReason !== 'tool_use' || toolUseBlocks.length === 0 || !toolExecutor) break;

    const toolResults: ApiContentBlock[] = [];
    for (const tool of toolUseBlocks) {
      let parsedInput: Record<string, unknown> = {};
      try { parsedInput = JSON.parse(tool.input || '{}'); } catch { /* leave empty */ }

      yield { type: 'tool_call', toolId: tool.id, toolName: tool.name, toolInput: parsedInput };

      let result: string;
      try {
        result = await toolExecutor(tool.name, parsedInput);
      } catch (e) {
        result = `Error: ${String(e)}`;
      }

      yield { type: 'tool_call', toolId: tool.id, toolName: tool.name, toolInput: parsedInput, toolDone: true };
      toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result });
    }

    apiMessages.push({ role: 'user', content: toolResults });
  }

  yield { type: 'done' };
}
