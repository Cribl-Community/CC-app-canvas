/**
 * Tool definitions shared by every AI provider.
 * The AI uses these tools to read and write project files instead of
 * embedding code inside XML tags in the response text.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'write_file',
    description:
      'Write or overwrite a file in the project. Always supply the COMPLETE file content — never truncate or use "..." placeholders. Call this once per file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to project root, e.g. "src/App.tsx" or "config/proxies.yml"',
        },
        content: {
          type: 'string',
          description: 'Full content of the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the current content of a project file. Use this to inspect existing code before making targeted changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path to read, e.g. "src/App.tsx"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List all files currently in the project. Use this to understand the project structure before making changes.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];
