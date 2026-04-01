'use client';

import { useState, useCallback } from 'react';
import { Upload, Check, Loader2, X, AlertCircle, Paintbrush, Film, Image, RotateCcw } from 'lucide-react';
import { Button, Card, CardContent } from '@neofilm/ui';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';
import { useMediaLibrary } from '@/lib/api/hooks/use-media';
import { formatFileSize, formatDuration } from '@/lib/utils';
import { CanvaDesignPicker } from '@/components/canva/canva-design-picker';

const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1 GB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;   // 10 MB
const MIN_DURATION_S = 12;
const MAX_DURATION_S = 30;

interface UploadState {
  file: File | null;
  progress: number;
  error: string | null;
  status: 'idle' | 'validating' | 'uploading' | 'processing' | 'ready' | 'error';
}

const idleState: UploadState = { file: null, progress: 0, error: null, status: 'idle' };

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
    video.onerror = () => reject(new Error('Impossible de lire le fichier vidéo'));
    video.src = URL.createObjectURL(file);
  });
}


const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function uploadFileToApi(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ key: string; fileUrl: string }> {
  return new Promise((resolve, reject) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('neofilm_adv_token') : null;
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status < 400) {
        try {
          const json = JSON.parse(xhr.responseText);
          const data = (json && 'data' in json && 'statusCode' in json) ? json.data : json;
          resolve(data);
        } catch {
          reject(new Error('Réponse invalide du serveur'));
        }
      } else {
        reject(new Error(`Erreur upload: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau'));
    xhr.open('POST', `${API_URL}/creatives/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

// ─── Video upload zone ────────────────────────────────────────────────────────

function VideoUploadZone({
  uploadState,
  draftUrl,
  draftDurationMs,
  onUpload,
  onReset,
}: {
  uploadState: UploadState;
  draftUrl: string | null;
  draftDurationMs: number | null;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const isReady = uploadState.status === 'ready';
  const hasDraft = draftUrl && !draftDurationMs === false; // has video

  if (isReady || hasDraft) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Film className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Spot publicitaire</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="aspect-video w-48 overflow-hidden rounded-md bg-black shrink-0">
              <video src={draftUrl!} controls className="h-full w-full" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <p className="font-medium text-sm">Vidéo prête</p>
              </div>
              <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {uploadState.file && <p>{uploadState.file.name} — {formatFileSize(uploadState.file.size)}</p>}
                {draftDurationMs && <p>Durée : {formatDuration(draftDurationMs)}</p>}
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
                Changer la vidéo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (uploadState.status === 'uploading' || uploadState.status === 'validating') {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Film className="h-5 w-5 text-primary shrink-0" />
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">{uploadState.file?.name}</p>
            <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${uploadState.progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {uploadState.status === 'validating' ? 'Validation...' : `Upload ${uploadState.progress}%`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onReset}><X className="h-4 w-4" /></Button>
        </CardContent>
      </Card>
    );
  }

  if (uploadState.status === 'processing') {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Film className="h-5 w-5 text-primary shrink-0" />
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Traitement en cours...</p>
            <p className="text-xs text-muted-foreground">Transcodage et génération des miniatures</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (uploadState.status === 'error') {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center gap-4 p-4">
          <Film className="h-5 w-5 text-destructive shrink-0" />
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">{uploadState.error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>Réessayer</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Spot publicitaire — Vidéo</span>
        <span className="text-xs text-muted-foreground">MP4/MOV, 15-30s, max 1 Go</span>
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
      >
        <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-1 font-medium">Glissez votre vidéo ici</p>
        <p className="mb-3 text-sm text-muted-foreground">MP4 ou MOV, 15-30s</p>
        <label>
          <input type="file" accept="video/mp4,video/quicktime" onChange={handleFileInput} className="sr-only" />
          <span className="cursor-pointer text-sm font-medium text-primary hover:underline">Ou parcourir vos fichiers</span>
        </label>
      </div>
    </div>
  );
}

// ─── Image upload zone ────────────────────────────────────────────────────────

function ImageUploadZone({
  uploadState,
  draftUrl,
  onUpload,
  onReset,
}: {
  uploadState: UploadState;
  draftUrl: string | null;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const isReady = uploadState.status === 'ready';

  if (isReady || draftUrl) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Image className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Fiche catalogue</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-32 w-32 overflow-hidden rounded-md bg-muted shrink-0">
              <img src={draftUrl!} alt="Aperçu catalogue" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <p className="font-medium text-sm">Image prête</p>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {uploadState.file && <p>{uploadState.file.name} — {formatFileSize(uploadState.file.size)}</p>}
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
                Changer l'image
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (uploadState.status === 'uploading' || uploadState.status === 'validating') {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Image className="h-5 w-5 text-primary shrink-0" />
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">{uploadState.file?.name}</p>
            <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${uploadState.progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Upload {uploadState.progress}%</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onReset}><X className="h-4 w-4" /></Button>
        </CardContent>
      </Card>
    );
  }

  if (uploadState.status === 'error') {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center gap-4 p-4">
          <Image className="h-5 w-5 text-destructive shrink-0" />
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">{uploadState.error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>Réessayer</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Image className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Fiche catalogue — Image</span>
        <span className="text-xs text-muted-foreground">JPG, PNG ou WebP, max 10 Mo</span>
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
      >
        <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-1 font-medium">Glissez votre image ici</p>
        <p className="mb-3 text-sm text-muted-foreground">JPG, PNG ou WebP</p>
        <label>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileInput} className="sr-only" />
          <span className="cursor-pointer text-sm font-medium text-primary hover:underline">Ou parcourir vos fichiers</span>
        </label>
      </div>
    </div>
  );
}

// ─── Previous videos picker ───────────────────────────────────────────────────

function PreviousVideosPicker({ onSelect }: { onSelect: (video: { id: string; name: string; fileUrl: string; durationMs: number }) => void }) {
  const { data, isLoading } = useMediaLibrary({ type: 'VIDEO', status: 'READY', limit: 20 });
  const videos = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de vos vidéos...
      </div>
    );
  }

  if (videos.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Ou reprendre une vidéo précédente</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {videos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect({ id: v.id, name: v.name, fileUrl: v.fileUrl, durationMs: v.durationMs })}
            className="group relative overflow-hidden rounded-lg border-2 border-muted transition-colors hover:border-primary focus:border-primary focus:outline-none"
          >
            <div className="aspect-video bg-black">
              <video
                src={v.fileUrl}
                muted
                preload="metadata"
                className="h-full w-full object-cover"
                onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                onMouseLeave={(e) => { const el = e.target as HTMLVideoElement; el.pause(); el.currentTime = 0; }}
              />
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-medium">{v.name}</p>
              <p className="text-xs text-muted-foreground">
                {v.durationMs > 0 ? formatDuration(v.durationMs) : '—'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main StepMedia component ─────────────────────────────────────────────────

export function StepMedia() {
  const { draft, updateDraft, nextStep, prevStep, editingCampaignId } = useCampaignWizard();
  const isEditing = !!editingCampaignId;

  const hasAdSpot = draft.types.includes('AD_SPOT');
  const hasCatalog = draft.types.includes('CATALOG_LISTING');

  const [videoUpload, setVideoUpload] = useState<UploadState>({
    ...idleState,
    status: draft.mediaStatus === 'ready' ? 'ready' : 'idle',
  });
  const [imageUpload, setImageUpload] = useState<UploadState>({
    ...idleState,
    status: draft.catalogImageStatus === 'ready' ? 'ready' : 'idle',
  });
  const [canvaOpen, setCanvaOpen] = useState(false);

  // ── Video upload ──
  async function handleVideoUpload(file: File) {
    setVideoUpload({ file, progress: 0, error: null, status: 'validating' });

    if (!VIDEO_TYPES.includes(file.type)) {
      setVideoUpload((s) => ({ ...s, status: 'error', error: 'Format non supporté. Utilisez MP4 ou MOV.' }));
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoUpload((s) => ({ ...s, status: 'error', error: `Fichier trop volumineux. Maximum ${formatFileSize(MAX_VIDEO_SIZE)}.` }));
      return;
    }

    let duration: number;
    try {
      duration = await getVideoDuration(file);
    } catch {
      setVideoUpload((s) => ({ ...s, status: 'error', error: 'Impossible de lire la durée de la vidéo.' }));
      return;
    }

    if (duration < MIN_DURATION_S || duration > MAX_DURATION_S) {
      setVideoUpload((s) => ({
        ...s,
        status: 'error',
        error: `La durée doit être entre ${MIN_DURATION_S}s et ${MAX_DURATION_S}s. Détecté : ${Math.round(duration)}s.`,
      }));
      return;
    }

    setVideoUpload((s) => ({ ...s, status: 'uploading', progress: 0 }));

    let key: string;
    let fileUrl: string;
    try {
      const result = await uploadFileToApi(file, (pct) => {
        setVideoUpload((s) => ({ ...s, progress: pct }));
      });
      key = result.key;
      fileUrl = result.fileUrl;
    } catch (e: any) {
      setVideoUpload((s) => ({ ...s, status: 'error', error: e?.message ?? "Erreur lors de l'upload." }));
      return;
    }

    setVideoUpload((s) => ({ ...s, status: 'processing' }));
    const objectUrl = URL.createObjectURL(file);
    setVideoUpload((s) => ({ ...s, status: 'ready' }));
    updateDraft({
      mediaId: key,
      mediaKey: key,
      mediaFileUrl: fileUrl,
      mediaUrl: objectUrl,
      mediaThumbnail: objectUrl,
      mediaDurationMs: Math.round(duration * 1000),
      mediaStatus: 'ready',
    });
  }

  function handleVideoReset() {
    setVideoUpload(idleState);
    updateDraft({ mediaId: null, mediaKey: null, mediaFileUrl: null, mediaUrl: null, mediaThumbnail: null, mediaDurationMs: null, mediaStatus: 'none' });
  }

  // ── Image upload ──
  async function handleImageUpload(file: File) {
    setImageUpload({ file, progress: 0, error: null, status: 'validating' });

    if (!IMAGE_TYPES.includes(file.type)) {
      setImageUpload((s) => ({ ...s, status: 'error', error: 'Format non supporté. Utilisez JPG, PNG ou WebP.' }));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageUpload((s) => ({ ...s, status: 'error', error: `Image trop volumineuse. Maximum ${formatFileSize(MAX_IMAGE_SIZE)}.` }));
      return;
    }

    setImageUpload((s) => ({ ...s, status: 'uploading', progress: 0 }));

    let key: string;
    let fileUrl: string;
    try {
      const result = await uploadFileToApi(file, (pct) => {
        setImageUpload((s) => ({ ...s, progress: pct }));
      });
      key = result.key;
      fileUrl = result.fileUrl;
    } catch (e: any) {
      setImageUpload((s) => ({ ...s, status: 'error', error: e?.message ?? "Erreur lors de l'upload." }));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImageUpload((s) => ({ ...s, status: 'ready' }));
    updateDraft({
      catalogImageId: key,
      catalogImageKey: key,
      catalogImageFileUrl: fileUrl,
      catalogImageUrl: objectUrl,
      catalogImageStatus: 'ready',
    });
  }

  function handleImageReset() {
    setImageUpload(idleState);
    updateDraft({ catalogImageId: null, catalogImageKey: null, catalogImageFileUrl: null, catalogImageUrl: null, catalogImageStatus: 'none' });
  }

  function handleSelectPreviousVideo(video: { id: string; name: string; fileUrl: string; durationMs: number }) {
    setVideoUpload({ file: null, progress: 100, error: null, status: 'ready' });
    updateDraft({
      mediaId: video.id,
      mediaKey: null,
      mediaFileUrl: video.fileUrl,
      mediaUrl: video.fileUrl,
      mediaThumbnail: video.fileUrl,
      mediaDurationMs: video.durationMs,
      mediaStatus: 'ready',
    });
  }

  function handleCanvaImport(result: { creativeId: string; fileUrl: string; mimeType: string; fileSizeBytes: number }) {
    const isVideo = result.mimeType.startsWith('video/');
    if (isVideo) {
      setVideoUpload((s) => ({ ...s, status: 'ready' }));
      updateDraft({ mediaId: result.creativeId, mediaKey: null, mediaFileUrl: result.fileUrl, mediaUrl: result.fileUrl, mediaThumbnail: result.fileUrl, mediaDurationMs: 20000, mediaStatus: 'ready' });
    } else {
      setImageUpload((s) => ({ ...s, status: 'ready' }));
      updateDraft({ catalogImageId: result.creativeId, catalogImageKey: null, catalogImageFileUrl: result.fileUrl, catalogImageUrl: result.fileUrl, catalogImageStatus: 'ready' });
    }
  }

  const videoReady = !hasAdSpot || videoUpload.status === 'ready' || draft.mediaStatus === 'ready';
  // When both AD_SPOT + CATALOG, image is handled in the separate catalog step
  const imageReady = !hasCatalog || hasAdSpot || imageUpload.status === 'ready' || draft.catalogImageStatus === 'ready';
  const canProceed = videoReady && imageReady;

  // ── Edit mode: show existing media as read-only ──
  if (isEditing) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Médias publicitaires</h2>
        <p className="text-sm text-muted-foreground">
          Les médias ne peuvent pas être modifiés après la création de la campagne.
        </p>

        {hasAdSpot && draft.mediaUrl && (
          <Card className="opacity-70">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Film className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Spot publicitaire</span>
              </div>
              <div className="flex items-start gap-4">
                <div className="aspect-video w-48 overflow-hidden rounded-md bg-black shrink-0">
                  <video src={draft.mediaUrl} controls className="h-full w-full" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <p className="font-medium text-sm">Vidéo prête</p>
                  </div>
                  {draft.mediaDurationMs && (
                    <p className="mt-1 text-sm text-muted-foreground">Durée : {formatDuration(draft.mediaDurationMs)}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {hasCatalog && !hasAdSpot && draft.catalogImageUrl && (
          <Card className="opacity-70">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Image className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Image catalogue</span>
              </div>
              <div className="flex items-start gap-4">
                <div className="h-32 w-32 overflow-hidden rounded-md bg-muted shrink-0">
                  <img src={draft.catalogImageUrl} alt="Catalogue" className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <p className="font-medium text-sm">Image prête</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={prevStep}>Précédent</Button>
          <Button onClick={nextStep}>Suivant</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Médias publicitaires</h2>
      <p className="text-sm text-muted-foreground">
        {hasAdSpot
            ? 'Uploadez votre vidéo (MP4/MOV, 15-30s, max 1 Go).'
            : 'Uploadez l\'image pour votre fiche catalogue (JPG/PNG/WebP, max 10 Mo).'}
      </p>

      {/* Spot vidéo */}
      {hasAdSpot && (
        <>
          <VideoUploadZone
            uploadState={videoUpload}
            draftUrl={draft.mediaUrl}
            draftDurationMs={draft.mediaDurationMs}
            onUpload={handleVideoUpload}
            onReset={handleVideoReset}
          />
          {videoUpload.status === 'idle' && draft.mediaStatus !== 'ready' && (
            <PreviousVideosPicker onSelect={handleSelectPreviousVideo} />
          )}
        </>
      )}

      {/* Image catalogue — only when catalog-only (no AD_SPOT), otherwise image is in step-catalog */}
      {hasCatalog && !hasAdSpot && (
        <ImageUploadZone
          uploadState={imageUpload}
          draftUrl={draft.catalogImageUrl}
          onUpload={handleImageUpload}
          onReset={handleImageReset}
        />
      )}

      {/* Canva / AI options — only on idle states */}
      {((hasAdSpot && videoUpload.status === 'idle' && draft.mediaStatus !== 'ready') ||
        (hasCatalog && !hasAdSpot && imageUpload.status === 'idle' && draft.catalogImageStatus !== 'ready')) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Génération IA désactivée temporairement
          {hasAdSpot && videoUpload.status === 'idle' && draft.mediaStatus !== 'ready' && (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6">
              <Sparkles className="mb-2 h-8 w-8 text-primary" />
              <p className="mb-1 font-medium text-sm">Générer avec l'IA</p>
              <p className="mb-3 text-center text-xs text-muted-foreground">Créez un spot vidéo en quelques clics</p>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = '/ad-creation')}>
                Ouvrir le générateur
              </Button>
            </div>
          )}
          */}
          <p className="col-span-full text-center text-sm text-muted-foreground">
            Pas encore de visuel ?{' '}
            <button
              type="button"
              onClick={() => setCanvaOpen(true)}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Paintbrush className="h-3.5 w-3.5" />
              Créer avec Canva
            </button>
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>Précédent</Button>
        <Button onClick={nextStep} disabled={!canProceed}>Suivant</Button>
      </div>

      <CanvaDesignPicker open={canvaOpen} onOpenChange={setCanvaOpen} onAssetImported={handleCanvaImport} />
    </div>
  );
}
