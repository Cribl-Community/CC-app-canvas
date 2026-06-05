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
  type: 'text' | 'file_start' | 'file_content' | 'file_end' | 'done' | 'error';
  text?: string;
  path?: string;
  error?: string;
}
