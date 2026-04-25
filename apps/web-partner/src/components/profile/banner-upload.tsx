'use client';

import { useRef, useState } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@neofilm/ui';
import { toast } from 'sonner';

interface BannerUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function BannerUpload({ value, onChange }: BannerUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Format non supporté. Utilisez JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`Fichier trop volumineux. Maximum ${MAX_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('neofilm_partner_token') : null;
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/creatives/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');

      const json = await res.json();
      const data = json && 'data' in json && 'statusCode' in json ? json.data : json;
      onChange(data.fileUrl);
      toast.success('Bannière uploadée');
    } catch {
      toast.error("Erreur lors de l'upload de la bannière");
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  if (value) {
    return (
      <div className="relative aspect-[10/1] w-full overflow-hidden rounded-lg border bg-muted">
        <img src={value} alt="Aperçu bannière" className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-muted/50'
        }`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Upload en cours…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Glissez une bannière ou cliquez</p>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP — max {MAX_SIZE_MB}MB. Recommandé : 1920×200.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-1">
              Parcourir
            </Button>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={handleInputChange}
      />
    </>
  );
}
