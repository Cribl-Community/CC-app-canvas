import { useState } from 'react';
import type { ChatMessage as ChatMessageType } from '../../types';

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="chat-avatar">{isUser ? 'You' : 'AI'}</div>
      <div className="chat-bubble">
        <MessageContent content={message.content} />
        {message.files && message.files.length > 0 && (
          <div className="chat-files">
            {message.files.map(f => (
              <span key={f} className="file-chip">{f}</span>
            ))}
          </div>
        )}
        {message.rawContent && (
          <div className="raw-output-toggle">
            <button
              className="raw-output-btn"
              onClick={() => setShowRaw(v => !v)}
            >
              {showRaw ? '▾ Hide raw output' : '▸ Show raw output'}
            </button>
            {showRaw && (
              <pre className="raw-output-pre">{message.rawContent}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  // Render inline code and file references with simple markdown-like formatting
  const parts = content.split(/(`[^`]+`)/g);
  return (
    <p className="chat-text">
      {parts.map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="inline-code">{part.slice(1, -1)}</code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
