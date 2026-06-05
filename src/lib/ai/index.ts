import type { ChatMessage, StreamChunk, Settings, ToolExecutor } from '../../types';
import { streamAnthropic, DEFAULT_ANTHROPIC_MODEL } from './anthropic';
import { streamBedrock, DEFAULT_BEDROCK_MODEL } from './bedrock';

export { ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODEL } from './anthropic';
export { BEDROCK_MODELS, DEFAULT_BEDROCK_MODEL } from './bedrock';

export async function* streamAI(
  messages: ChatMessage[],
  settings: Partial<Settings>,
  signal?: AbortSignal,
  toolExecutor?: ToolExecutor,
): AsyncGenerator<StreamChunk> {
  const provider = settings.provider ?? 'anthropic';

  if (provider === 'anthropic') {
    const model = settings.model ?? DEFAULT_ANTHROPIC_MODEL;
    yield* streamAnthropic(messages, model, settings.anthropicApiKey, signal, toolExecutor);
  } else {
    const model = settings.model ?? DEFAULT_BEDROCK_MODEL;
    const region = settings.bedrockRegion ?? 'us-east-1';
    const accessKeyId = settings.bedrockAccessKeyId ?? '';
    const secretAccessKey = settings.bedrockSecretAccessKey ?? '';

    if (!accessKeyId || !secretAccessKey) {
      yield { type: 'error', error: 'AWS credentials not configured. Open Settings to add your Bedrock access key.' };
      return;
    }

    yield* streamBedrock(messages, model, region, accessKeyId, secretAccessKey, signal, toolExecutor);
  }
}
