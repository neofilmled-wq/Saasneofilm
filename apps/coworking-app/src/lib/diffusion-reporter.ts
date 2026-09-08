import { deviceApi } from './device-api';
import { CW_CONFIG } from './constants';

/**
 * Buffered diffusion-proof reporter for the Coworking ad loop.
 *
 * The legacy TV app posts one proof per request, which is fine there because
 * its interstitials are rate-limited by the TV macros. The Coworking screen
 * loops ads continuously, so a per-play request would run into the backend's
 * 10 req/min throttle on POST /diffusion/log. Proofs are therefore buffered
 * and flushed as a batch (the endpoint accepts up to 100 per call).
 *
 * The buffer is module-level on purpose: the ad loop unmounts whenever the
 * launcher (app grid) is opened, and pending proofs must survive that.
 */

export interface PendingImpression {
  screenId: string;
  campaignId: string;
  creativeId: string;
  startedAt: number;
  endedAt: number;
  mediaHash: string;
}

/** Backend caps a batch at 100 proofs; stay well under it. */
const MAX_BATCH = 50;
/** Hard cap so a long offline stretch cannot grow the buffer without bound. */
const MAX_BUFFER = 200;

let buffer: PendingImpression[] = [];
let flushing = false;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Queue one finished ad play. Callers must only pass real scheduled ads —
 * the bundled local fallbacks (Dupplex video, NeoFilm placeholder) carry no
 * campaign or creative and are not billable diffusions.
 */
export function recordImpression(imp: PendingImpression): void {
  // durationMs must be strictly positive server-side (zod .positive()).
  if (imp.endedAt <= imp.startedAt) return;
  if (!imp.screenId || !imp.campaignId || !imp.creativeId) return;

  buffer.push(imp);
  // Drop the oldest proofs first if we somehow overflow.
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
}

/** Number of proofs waiting to be sent — used by tests and diagnostics. */
export function pendingCount(): number {
  return buffer.length;
}

/**
 * Send buffered proofs. On failure the batch is put back at the head of the
 * buffer so the next flush retries it, rather than silently losing plays.
 */
export async function flushImpressions(deviceId: string): Promise<void> {
  if (flushing || buffer.length === 0 || !deviceId) return;
  flushing = true;

  const batch = buffer.slice(0, MAX_BATCH);
  buffer = buffer.slice(batch.length);

  try {
    await deviceApi.reportImpression({
      deviceId,
      batchId: makeId(),
      proofs: batch.map((imp) => ({
        proofId: makeId(),
        screenId: imp.screenId,
        campaignId: imp.campaignId,
        creativeId: imp.creativeId,
        startTime: new Date(imp.startedAt).toISOString(),
        endTime: new Date(imp.endedAt).toISOString(),
        durationMs: imp.endedAt - imp.startedAt,
        // COWORKING_LOOP is not part of the backend's triggerContext enum;
        // SCHEDULED is the value the legacy app uses for its rotation zone,
        // which is the same "playing the scheduled queue" semantics.
        triggerContext: 'SCHEDULED',
        appVersion: CW_CONFIG.APP_VERSION,
        mediaHash: imp.mediaHash || 'none',
        // Backend accepts 'none' while ALLOW_UNSIGNED_PROOF is not 'false',
        // matching the legacy fleet. Same TODO applies here: sign in the APK.
        signature: 'none',
      })),
    });
  } catch {
    // Requeue ahead of newer proofs, still respecting the overall cap.
    buffer = [...batch, ...buffer].slice(-MAX_BUFFER);
  } finally {
    flushing = false;
  }
}
