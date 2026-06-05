export type AIProvider = 'anthropic' | 'bedrock';

export interface Settings {
  provider: AIProvider;
  model: string;
  anthropicApiKey: string;
  bedrockRegion: string;
  bedrockAccessKeyId: string;
  bedrockSecretAccessKey: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** File paths mentioned/generated in this message */
  files?: string[];
  /** Full unstripped AI response — stored so the user can toggle "show raw output" */
  rawContent?: string;
}

export interface ProjectFiles {
  [path: string]: string;
}

export interface Project {
  meta: ProjectMeta;
  messages: ChatMessage[];
  files: ProjectFiles;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  text?: string;
  error?: string;
  /** Tool call details (type === 'tool_call') */
  toolId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  /** True when the tool has finished executing and a result was sent back */
  toolDone?: boolean;
}

/** Callback that App.tsx provides to execute tool calls during the agentic loop */
export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<string>;
