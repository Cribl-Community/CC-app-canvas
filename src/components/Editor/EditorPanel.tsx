import { useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type { ProjectFiles } from '../../types';
import { FileTreePanel } from './FileTreePanel';

interface Props {
  files: ProjectFiles;
  onFileChange: (path: string, content: string) => void;
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop() ?? '';
  const map: Record<string, string> = {
    tsx: 'typescript', ts: 'typescript',
    jsx: 'javascript', js: 'javascript',
    css: 'css', json: 'json',
    yml: 'yaml', yaml: 'yaml',
    md: 'markdown', html: 'html',
  };
  return map[ext] ?? 'plaintext';
}

export function EditorPanel({ files, onFileChange }: Props) {
  const [activeFile, setActiveFile] = useState<string | null>(
    () => Object.keys(files)[0] ?? null,
  );

  const content = activeFile ? (files[activeFile] ?? '') : '';

  return (
    <div className="editor-panel">
      <div className="editor-tree">
        <FileTreePanel
          files={files}
          activeFile={activeFile}
          onSelect={setActiveFile}
        />
      </div>
      <div className="editor-main">
        {activeFile ? (
          <>
            <div className="editor-tab-bar">
              <span className="editor-tab active">{activeFile.split('/').pop()}</span>
              <span className="editor-tab-path">{activeFile}</span>
            </div>
            <div className="editor-monaco">
              <MonacoEditor
                key={activeFile}
                value={content}
                language={getLanguage(activeFile)}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  padding: { top: 12 },
                }}
                onChange={value => {
                  if (activeFile && value !== undefined) {
                    onFileChange(activeFile, value);
                  }
                }}
              />
            </div>
          </>
        ) : (
          <div className="editor-empty">Select a file to edit</div>
        )}
      </div>
    </div>
  );
}
