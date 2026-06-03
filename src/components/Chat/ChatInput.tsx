import { useState, useRef, useEffect } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleSend = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="chat-input-row">
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={value}
        placeholder={placeholder ?? 'Describe the app you want to build…'}
        disabled={disabled}
        rows={1}
        onChange={e => { setValue(e.target.value); autoResize(); }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <button
        className={`send-btn ${disabled ? 'disabled' : ''}`}
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send"
      >
        {disabled ? '⏳' : '▶'}
      </button>
    </div>
  );
}
