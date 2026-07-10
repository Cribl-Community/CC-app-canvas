import { useState, useCallback, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, ProjectFiles, ProjectMeta, Settings } from './types';
import { streamAI, parseAIResponse } from './lib/ai';
import {
  listProjectMetas, loadMessages, saveMessages, loadProjectFiles,
  saveFile, saveProjectFiles, saveProjectMeta, deleteProject, loadSettings, saveSettings,
} from './lib/kvstore';
import { buildCrbl, buildSourceTgz } from './lib/packager';
import { SAMPLE_APP_FILES, SAMPLE_APP_NAME } from './lib/sampleApp';
import { ProjectSidebar } from './components/Sidebar/ProjectSidebar';
import { ChatPanel } from './components/Chat/ChatPanel';
import { PreviewPanel } from './components/Preview/PreviewPanel';
import { EditorPanel } from './components/Editor/EditorPanel';
import { SettingsModal } from './components/Settings/SettingsModal';

export default function App() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<ProjectFiles>({});
  const [streamingText, setStreamingText] = useState('');
  const [streamingRaw, setStreamingRaw] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [previewTrigger, setPreviewTrigger] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Partial<Settings>>({ provider: 'anthropic', model: 'claude-sonnet-4-5' });
  const [downloading, setDownloading] = useState(false);
  const [downloadingSource, setDownloadingSource] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [chatWidthPct, setChatWidthPct] = useState(40);
  const abortRef = useRef<AbortController | null>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handleSplitterMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('dragging-splitter');

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !mainAreaRef.current) return;
      const rect = mainAreaRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setChatWidthPct(Math.min(75, Math.max(20, pct)));
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('dragging-splitter');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Load projects and settings on mount
  useEffect(() => {
    listProjectMetas().then(setProjects);
    loadSettings().then(s => {
      if (s && Object.keys(s).length > 0) {
        setSettings(s);
      }
    }).catch(() => { /* storage unavailable, keep defaults */ });
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setActiveProjectId(id);
    const [msgs, projectFiles] = await Promise.all([
      loadMessages(id),
      loadProjectFiles(id),
    ]);
    setMessages(msgs);
    setFiles(projectFiles);
    setPreviewTrigger(t => t + 1);
  }, []);

  const createProject = useCallback((): string => {
    const id = uuidv4();
    const meta: ProjectMeta = {
      id,
      name: 'New App',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveProjectMeta(meta);
    setProjects(prev => [meta, ...prev]);
    setActiveProjectId(id);
    setMessages([]);
    setFiles({});
    return id;
  }, []);

  const handleNewProject = () => createProject();

  const handleRenameProject = async (id: string, name: string, appId?: string) => {
    const meta = projects.find(p => p.id === id);
    if (!meta) return;
    const updated = { ...meta, name, appId: appId ?? meta.appId, updatedAt: Date.now() };
    await saveProjectMeta(updated);
    setProjects(prev => prev.map(p => p.id === id ? updated : p));
  };

  const handleLoadSample = useCallback(() => {
    const id = createProject();
    setFiles(SAMPLE_APP_FILES);
    setPreviewTrigger(t => t + 1);
    handleRenameProject(id, SAMPLE_APP_NAME);
    saveProjectFiles(id, SAMPLE_APP_FILES);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectProject = (id: string) => {
    if (id !== activeProjectId) loadProject(id);
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    const updated = await listProjectMetas();
    setProjects(updated);
    if (id === activeProjectId) {
      setActiveProjectId(null);
      setMessages([]);
      setFiles({});
    }
  };

  const handleFileChange = useCallback((path: string, content: string) => {
    setFiles(prev => ({ ...prev, [path]: content }));
    if (activeProjectId) {
      saveFile(activeProjectId, path, content);
    }
    // No auto-rebuild — user clicks Build explicitly
  }, [activeProjectId]);

  const handleBuild = useCallback(() => {
    setPreviewTrigger(t => t + 1);
  }, []);

  const handleSend = useCallback(async (text: string) => {
    if (isStreaming) return;

    let projectId = activeProjectId;
    if (!projectId) {
      projectId = createProject();
    }

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: text,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsStreaming(true);
    setStreamingText('');
    setStreamingRaw('');

    // Save user message
    await saveMessages(projectId, nextMessages);

    // Auto-name the project from the first message
    if (messages.length === 0) {
      const shortName = text.slice(0, 40) + (text.length > 40 ? '…' : '');
      const autoAppId = shortName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app';
      handleRenameProject(projectId, shortName, autoAppId);
    }

    abortRef.current = new AbortController();
    let accumulated = '';
    let hasError = false;

    try {
      // On follow-up messages, inject the current file contents into the last user
      // message so the AI works from the real live code rather than reconstructing
      // from its memory of what it previously generated.
      let aiMessages = nextMessages;
      if (messages.length > 0 && Object.keys(files).length > 0) {
        const fileContext = Object.entries(files)
          .map(([path, content]) => `<file path="${path}">\n${content}\n</file>`)
          .join('\n');
        const lastMsg = nextMessages[nextMessages.length - 1];
        aiMessages = [
          ...nextMessages.slice(0, -1),
          {
            ...lastMsg,
            content: `[Current file contents — work from these exactly, do not reimagine them]\n${fileContext}\n[End file contents]\n\n${lastMsg.content}`,
          },
        ];
      }

      const stream = streamAI(aiMessages, settings, abortRef.current.signal);

      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.text) {
          accumulated += chunk.text;
          // Show narrative text (strip file blocks from display)
          const { text: displayText } = parseAIResponse(accumulated);
          setStreamingText(displayText);
          setStreamingRaw(accumulated);
        } else if (chunk.type === 'error') {
          hasError = true;
          accumulated = `Error: ${chunk.error}`;
          setStreamingText(accumulated);
          break;
        } else if (chunk.type === 'done') {
          break;
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        accumulated = `Error: ${String(e)}`;
        hasError = true;
        setStreamingText(accumulated);
      }
    }

    // Parse files from the full response
    const { text: displayText, files: newFiles } = parseAIResponse(accumulated);

    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: displayText || accumulated,
      files: Object.keys(newFiles),
      rawContent: accumulated,
    };

    const finalMessages = [...nextMessages, assistantMsg];
    setMessages(finalMessages);
    setStreamingText('');
    setStreamingRaw('');
    setIsStreaming(false);

    if (!hasError) {
      // Merge new files into the project
      if (Object.keys(newFiles).length > 0) {
        const mergedFiles = { ...files, ...newFiles };
        setFiles(mergedFiles);
        setPreviewTrigger(t => t + 1);

        // Save all merged files in a single KV write to avoid race conditions
        await saveProjectFiles(projectId, mergedFiles);
      }

      await saveMessages(projectId, finalMessages);

      // Update project timestamp
      const meta = projects.find(p => p.id === projectId);
      if (meta) {
        const updated = { ...meta, updatedAt: Date.now() };
        await saveProjectMeta(updated);
        setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, isStreaming, messages, files, settings, projects]);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    if (downloading || Object.keys(files).length === 0) return;
    const meta = projects.find(p => p.id === activeProjectId);
    if (!meta) return;

    setDownloading(true);
    try {
      const blob = await buildCrbl(meta, files);
      const dlName = meta.appId || meta.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'app';
      triggerDownload(blob, `${dlName}.tgz`);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSource = async () => {
    if (downloadingSource || Object.keys(files).length === 0) return;
    const meta = projects.find(p => p.id === activeProjectId);
    if (!meta) return;

    setDownloadingSource(true);
    try {
      const blob = await buildSourceTgz(meta, files);
      const dlName = meta.appId || meta.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'app';
      triggerDownload(blob, `${dlName}-source.tgz`);
    } catch (e) {
      console.error('Source download failed:', e);
    } finally {
      setDownloadingSource(false);
    }
  };

  const fileCount = Object.keys(files).length;
  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <span className="app-logo">🎨 App Canvas</span>
          {activeProject && (
            <span className="project-name">{activeProject.name}</span>
          )}
        </div>
        <div className="header-right">
          <button
            className={`header-btn ${showEditor ? 'active' : ''}`}
            onClick={() => setShowEditor(v => !v)}
            title="Toggle file editor"
          >
            &lt;/&gt; Files {fileCount > 0 && <span className="badge">{fileCount}</span>}
          </button>
          <button
            className="header-btn"
            onClick={handleDownload}
            disabled={downloading || fileCount === 0}
            title="Download deployable Cribl app (.tgz)"
          >
            {downloading ? '⏳' : '↓'} .tgz
          </button>
          <button
            className="header-btn"
            onClick={handleDownloadSource}
            disabled={downloadingSource || fileCount === 0}
            title="Download raw source files (npm install && npm run dev)"
          >
            {downloadingSource ? '⏳' : '↓'} Source
          </button>
          <button
            className="header-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙ Settings
          </button>
          <button
            className="header-btn"
            onClick={handleLoadSample}
            title="Load sample app for testing"
          >
            ⚗ Sample
          </button>
          <button
            className="header-btn primary"
            onClick={handleNewProject}
            title="New project"
          >
            + New
          </button>
        </div>
      </header>

      <div className="app-body">
        <ProjectSidebar
          projects={projects}
          activeId={activeProjectId}
          onSelect={handleSelectProject}
          onNew={handleNewProject}
          onDelete={handleDeleteProject}
          onRename={handleRenameProject}
        />

        <main className="main-area" ref={mainAreaRef}>
          <div className="chat-column" style={{ flexBasis: `${chatWidthPct}%` }}>
          <ChatPanel
            messages={messages}
            streamingText={streamingText}
            streamingRaw={streamingRaw}
            isStreaming={isStreaming}
            onSend={handleSend}
            hasProject={!!activeProjectId}
          />
          </div>

          <div className="splitter-handle" onMouseDown={handleSplitterMouseDown} />

          <div className={`right-pane ${showEditor ? 'with-editor' : ''}`}>
            {showEditor && (
              <div className="editor-column">
                <EditorPanel
                  files={files}
                  onFileChange={handleFileChange}
                  onBuild={handleBuild}
                  buildError={buildError}
                />
              </div>
            )}
            <PreviewPanel
              files={files}
              trigger={previewTrigger}
              onBuildResult={setBuildError}
            />
          </div>
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          initialSettings={settings}
          onClose={(saved) => {
            setShowSettings(false);
            setSettings(saved);
            saveSettings(saved).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
