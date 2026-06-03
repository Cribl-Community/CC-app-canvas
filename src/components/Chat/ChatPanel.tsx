import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType } from '../../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface Props {
  messages: ChatMessageType[];
  streamingText: string;
  isStreaming: boolean;
  onSend: (text: string) => void;
  hasProject: boolean;
}

export function ChatPanel({ messages, streamingText, isStreaming, onSend, hasProject }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {!hasProject && messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">⚡</div>
            <h2>Cribl Vibe Coder</h2>
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

        {isStreaming && streamingText && (
          <div className="chat-message assistant streaming">
            <div className="chat-avatar">AI</div>
            <div className="chat-bubble">
              <p className="chat-text">{streamingText}<span className="cursor-blink">▌</span></p>
            </div>
          </div>
        )}

        {isStreaming && !streamingText && (
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
