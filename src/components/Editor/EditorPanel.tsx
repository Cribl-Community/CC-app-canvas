import { useState, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type { ProjectFiles } from '../../types';
import { FileTreePanel } from './FileTreePanel';
import '../../lib/monacoSetup';

interface Props {
  files: ProjectFiles;
  onFileChange: (path: string, content: string) => void;
  onBuild: () => void;
  buildError: string;
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

export function EditorPanel({ files, onFileChange, onBuild, buildError }: Props) {
  const [activeFile, setActiveFile] = useState<string | null>(
    () => Object.keys(files)[0] ?? null,
  );
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [buildSuccess, setBuildSuccess] = useState(false);

  const handleBuild = () => {
    setBuildSuccess(false);
    onBuild();
  };

  // Show success badge when error clears after a build
  useEffect(() => {
    if (buildError === '') {
      const t1 = setTimeout(() => setBuildSuccess(true), 0);
      const t2 = setTimeout(() => setBuildSuccess(false), 3000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [buildError]);

  const showErrorPanel = !!buildError && buildError !== dismissedError;

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
              <div className="editor-tab-spacer" />
              <button className="build-btn" onClick={handleBuild} title="Build and refresh preview">
                ▶ Build
              </button>
              {buildSuccess && !buildError && (
                <span className="build-success-badge">✓ Built</span>
              )}
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
            {showErrorPanel && (
              <div className="editor-error-panel">
                <div className="editor-error-header">
                  <span className="editor-error-title">● Build error</span>
                  <button
                    className="icon-btn-sm"
                    title="Dismiss"
                    onClick={() => setDismissedError(buildError)}
                  >✕</button>
                </div>
                <pre className="editor-error-text">{buildError}</pre>
              </div>
            )}
          </>
        ) : (
          <div className="editor-empty">Select a file to edit</div>
        )}
      </div>
    </div>
  );
}
