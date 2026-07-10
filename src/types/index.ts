export type AIProvider = 'anthropic' | 'bedrock';

export interface Settings {
  provider: AIProvider;
  model: string;
  bedrockRegion: string;
  // Credential fields — always empty when loaded from KV (encrypted, unreadable).
  // Only populated transiently when the user enters new values in the Settings modal.
  anthropicApiKey: string;
  bedrockAccessKeyId: string;
  bedrockSecretAccessKey: string;
  // Sentinel flags — readable from KV, indicate whether a credential has been saved.
  // Never written to the config blob; populated by loadSettings() from sentinel keys.
  anthropicApiKeySet?: boolean;
  bedrockCredsSet?: boolean;
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
  type: 'text' | 'file_start' | 'file_content' | 'file_end' | 'done' | 'error';
  text?: string;
  path?: string;
  error?: string;
}
