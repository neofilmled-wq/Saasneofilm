'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button, Textarea } from '@neofilm/ui';

interface MessageComposerProps {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageComposer({ onSend, disabled, placeholder }: MessageComposerProps) {
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setBody('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t bg-card p-4">
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Tapez votre message...'}
        disabled={disabled}
        rows={1}
        className="min-h-[40px] max-h-[120px] resize-none"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || !body.trim()}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
