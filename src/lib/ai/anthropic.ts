import type { ChatMessage, StreamChunk, ToolExecutor } from '../../types';
import { SYSTEM_PROMPT } from './prompts';
import { TOOL_DEFINITIONS } from './tools';

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-3-5', label: 'Claude Haiku 3.5' },
];

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

const MAX_TOOL_ITERATIONS = 30;

// Internal API message types that support both string and block content
type ApiTextBlock = { type: 'text'; text: string };
type ApiToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
type ApiToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string };
type ApiContentBlock = ApiTextBlock | ApiToolUseBlock | ApiToolResultBlock;
type ApiMessage = { role: 'user' | 'assistant'; content: string | ApiContentBlock[] };

/**
 * Stream a response from Anthropic Claude using the tool-use agentic loop.
 *
 * The function drives multiple API round-trips until the model produces a
 * final response with stop_reason "end_turn" (no more tool calls).
 *
 * x-api-key is not in Cribl's stripped-headers list, so it passes through the proxy.
 */
export async function* streamAnthropic(
  messages: ChatMessage[],
  model: string,
  apiKey?: string,
  signal?: AbortSignal,
  toolExecutor?: ToolExecutor,
): AsyncGenerator<StreamChunk> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (apiKey) headers['x-api-key'] = apiKey;

  // Start with chat history as string-content messages
  const apiMessages: ApiMessage[] = messages.map(m => ({ role: m.role, content: m.content }));

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        stream: true,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
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

    // Collected from this streaming response
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
              index?: number;
              content_block?: { type: string; id?: string; name?: string };
              delta?: { type: string; text?: string; partial_json?: string; stop_reason?: string };
              error?: { message: string };
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

              case 'error':
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

    // Build assistant message content for conversation history
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

    // If the model didn't call any tools (or no executor provided), we're done
    if (stopReason !== 'tool_use' || toolUseBlocks.length === 0 || !toolExecutor) break;

    // Execute each tool and collect results
    const toolResults: ApiContentBlock[] = [];
    for (const tool of toolUseBlocks) {
      let parsedInput: Record<string, unknown> = {};
      try { parsedInput = JSON.parse(tool.input || '{}'); } catch { /* leave empty */ }

      // Announce the tool call to the UI
      yield { type: 'tool_call', toolId: tool.id, toolName: tool.name, toolInput: parsedInput };

      let result: string;
      try {
        result = await toolExecutor(tool.name, parsedInput);
      } catch (e) {
        result = `Error: ${String(e)}`;
      }

      // Signal that the tool call completed
      yield { type: 'tool_call', toolId: tool.id, toolName: tool.name, toolInput: parsedInput, toolDone: true };

      toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result });
    }

    apiMessages.push({ role: 'user', content: toolResults });
    // Continue the loop — model will see tool results and respond
  }

  yield { type: 'done' };
}
