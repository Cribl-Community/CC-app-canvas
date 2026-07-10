import type { ChatMessage, StreamChunk, Settings } from '../../types';
import { streamAnthropic, DEFAULT_ANTHROPIC_MODEL } from './anthropic';
import { streamBedrock, DEFAULT_BEDROCK_MODEL } from './bedrock';

export { ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODEL } from './anthropic';
export { BEDROCK_MODELS, DEFAULT_BEDROCK_MODEL } from './bedrock';

export async function* streamAI(
  messages: ChatMessage[],
  settings: Partial<Settings>,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const provider = settings.provider ?? 'anthropic';

  if (provider === 'anthropic') {
    const model = settings.model ?? DEFAULT_ANTHROPIC_MODEL;
    yield* streamAnthropic(messages, model, signal);
  } else {
    const model = settings.model ?? DEFAULT_BEDROCK_MODEL;
    const region = settings.bedrockRegion ?? 'us-east-1';
    const accessKeyId = settings.bedrockAccessKeyId ?? '';
    const secretAccessKey = settings.bedrockSecretAccessKey ?? '';

    if (!accessKeyId || !secretAccessKey) {
      const hint = settings.bedrockCredsSet
        ? 'Bedrock credentials must be re-entered each session. Open Settings to re-enter your AWS credentials.'
        : 'AWS credentials not configured. Open Settings to add your Bedrock access key.';
      yield { type: 'error', error: hint };
      return;
    }

    yield* streamBedrock(messages, model, region, accessKeyId, secretAccessKey, signal);
  }
}

/**
 * Parse AI response text, extracting <file path="...">content</file> blocks.
 * Returns { text: narrative text without file blocks, files: map of path→content }
 */
export function parseAIResponse(raw: string): { text: string; files: Record<string, string> } {
  const files: Record<string, string> = {};
  const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;

  let match: RegExpExecArray | null;
  let text = raw;

  while ((match = fileRegex.exec(raw)) !== null) {
    const [fullMatch, path, content] = match;
    files[path] = content.replace(/^\n/, '').replace(/\n$/, '');
    text = text.replace(fullMatch, `\`${path}\``);
  }

  return { text: text.trim(), files };
}
