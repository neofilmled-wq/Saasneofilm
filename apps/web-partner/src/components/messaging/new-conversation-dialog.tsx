'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button, Input, Label, Textarea } from '@neofilm/ui';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { subject?: string; body: string }) => void;
  isPending: boolean;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: NewConversationDialogProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    onSubmit({ subject: subject.trim() || undefined, body: body.trim() });
    setSubject('');
    setBody('');
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
    >
      <div className="relative w-full max-w-120 rounded-lg border bg-background p-6 shadow-lg mx-4">
        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Fermer</span>
        </button>

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Nouveau message</h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-conv-subject">Sujet (optionnel)</Label>
            <Input
              id="new-conv-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Question sur mon écran..."
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-conv-body">Message</Label>
            <Textarea
              id="new-conv-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Décrivez votre demande..."
              rows={5}
              required
              maxLength={5000}
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending || !body.trim()}>
              {isPending ? 'Envoi...' : 'Envoyer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
