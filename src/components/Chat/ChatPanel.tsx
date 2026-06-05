import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType } from '../../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface Props {
  messages: ChatMessageType[];
  streamingText: string;
  streamingRaw: string;
  isStreaming: boolean;
  onSend: (text: string) => void;
  hasProject: boolean;
}

interface StreamingDisplay {
  narrativeText: string;
  completedFiles: string[];
  activeFile: string | null;
}

function parseStreamingDisplay(raw: string): StreamingDisplay {
  const completedFiles: string[] = [];
  const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let text = raw;
  let match: RegExpExecArray | null;

  while ((match = fileRegex.exec(raw)) !== null) {
    completedFiles.push(match[1]);
    text = text.replace(match[0], '');
  }

  // Detect an in-progress file block (opening tag with no closing tag)
  const inProgressMatch = text.match(/<file\s+path="([^"]+)">([\s\S]*)$/);
  let activeFile: string | null = null;
  if (inProgressMatch) {
    activeFile = inProgressMatch[1];
    text = text.replace(inProgressMatch[0], '');
  }

  return { narrativeText: text.trim(), completedFiles, activeFile };
}

export function ChatPanel({ messages, streamingText, streamingRaw, isStreaming, onSend }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">⚡</div>
            <h2>Cribl Studio</h2>
            <p>Describe a Cribl app and I'll build it for you in real time.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="suggestion-chip" onClick={() => onSend(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isStreaming && streamingRaw && (() => {
          const { narrativeText, completedFiles, activeFile } = parseStreamingDisplay(streamingRaw);
          return (
            <div className="chat-message assistant streaming">
              <div className="chat-avatar">AI</div>
              <div className="chat-bubble">
                {narrativeText && (
                  <p className="chat-text">{narrativeText}</p>
                )}
                {(completedFiles.length > 0 || activeFile) && (
                  <div className="streaming-files">
                    {completedFiles.map(f => (
                      <div key={f} className="streaming-file done">
                        <span className="streaming-file-icon">✓</span>
                        <span className="streaming-file-name">{f}</span>
                      </div>
                    ))}
                    {activeFile && (
                      <div className="streaming-file active">
                        <span className="streaming-file-icon writing">…</span>
                        <span className="streaming-file-name">{activeFile}</span>
                      </div>
                    )}
                  </div>
                )}
                {!narrativeText && completedFiles.length === 0 && !activeFile && (
                  <span className="cursor-blink">▌</span>
                )}
              </div>
            </div>
          );
        })()}

        {isStreaming && !streamingRaw && (
          <div className="chat-message assistant">
            <div className="chat-avatar">AI</div>
            <div className="chat-bubble">
              <div className="thinking-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <ChatInput
          onSend={onSend}
          disabled={isStreaming}
          placeholder={
            messages.length === 0
              ? 'Describe the app you want to build…'
              : 'Continue the conversation…'
          }
        />
        <p className="chat-hint">Shift+Enter for newline · Enter to send</p>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Build a pipeline monitor dashboard that shows active Cribl pipelines and their throughput',
  'Create a log search app that queries Cribl search and displays results in a table',
  'Make a KV store browser to view and edit key-value pairs',
  'Build a system health dashboard with CPU, memory, and event rate metrics',
];
