'use client';

import { useRef, useState } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@neofilm/ui';
import { toast } from 'sonner';

interface LogoUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
}

// Must match the API's server-side allow-list (creatives.controller.ts) exactly,
// otherwise a file the client accepts gets rejected by the server with a
// confusing generic error. SVG is intentionally excluded (server refuses it).
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

/**
 * Logo uploader for the partner profile. Uploads to the same
 * `POST /creatives/upload` endpoint as the banner, but shows a compact square
 * preview since the logo is displayed as a small badge (bottom TV footer,
 * top bar). The resulting URL is stored in PartnerProfile.logoUrl.
 */
export function LogoUpload({ value, onChange }: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(`Format non supporté (${file.type || 'inconnu'}). Utilisez PNG, JPEG ou WebP.`);
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
      if (!res.ok) {
        // Surface the real reason (400 type refusé / 413 trop gros / 401-403 auth)
        // instead of a generic message, so failures are diagnosable.
        let reason = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          reason = errJson?.message ?? errJson?.error ?? reason;
        } catch {
          reason = res.status === 413 ? 'Fichier refusé par le serveur (trop volumineux)' : reason;
        }
        throw new Error(Array.isArray(reason) ? reason.join(', ') : String(reason));
      }

      const json = await res.json();
      const data = json && 'data' in json && 'statusCode' in json ? json.data : json;
      onChange(data.fileUrl);
      toast.success('Logo uploadé');
    } catch (e: any) {
      toast.error(`Échec de l'upload : ${e?.message ?? 'erreur inconnue'}`);
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

  return (
    <div className="flex items-start gap-4">
      {/* Current logo preview */}
      {value && (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted">
          <img src={value} alt="Logo actuel" className="h-full w-full object-contain p-1.5" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
            title="Supprimer le logo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Dropzone */}
      <div
        className={`flex flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 transition-colors ${
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
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Upload en cours…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex gap-2">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {value ? 'Glissez un nouveau logo pour le remplacer' : 'Glissez un logo ou cliquez'}
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, WebP, SVG — max {MAX_SIZE_MB}MB. Fond transparent conseillé.
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
    </div>
  );
}
