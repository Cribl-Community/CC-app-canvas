export type AIProvider = 'anthropic' | 'bedrock' | 'aperture';

export interface Settings {
  provider: AIProvider;
  model: string;
  anthropicApiKey: string;
  bedrockRegion: string;
  bedrockAccessKeyId: string;
  bedrockSecretAccessKey: string;
  apertureBaseUrl: string;
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
