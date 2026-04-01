'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAdIntervalOptions {
  /** Interval between ad triggers. Default: 7_200_000 ms (2 hours). */
  intervalMs?: number;
  /** Minimum ad display duration. Default: 15_000 ms (15 s). */
  minDurationMs?: number;
  /** Maximum ad display duration. Default: 30_000 ms (30 s). */
  maxDurationMs?: number;
  /** Called when the interval elapses and the ad should start showing. */
  onIntervalTrigger?: () => void;
  /** Called when the ad display window ends and the next interval begins. */
  onIntervalEnd?: () => void;
}

export interface UseAdIntervalReturn {
  /** Start (or restart) the 2-hour countdown. Safe to call multiple times. */
  startInterval: () => void;
  /** Stop the countdown and cancel any pending ad. Resets all state. */
  stopInterval: () => void;
  /** True while the ad is being displayed (during the 15–30 s window). */
  isShowingAd: boolean;
  /** Milliseconds remaining until the next ad trigger (0 while ad is showing). */
  remainingMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 7_200_000; // 2 hours
const DEFAULT_MIN_DURATION_MS = 15_000; // 15 s
const DEFAULT_MAX_DURATION_MS = 30_000; // 30 s

/** Tick resolution for the `remainingMs` counter (1 second). */
const TICK_MS = 1_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useAdInterval — manages periodic ad display on TV/Streaming pages.
 *
 * Lifecycle:
 * 1. Call `startInterval()` — a 2-hour countdown begins.
 * 2. After 2 h: `onIntervalTrigger()` fires, `isShowingAd` becomes `true`.
 * 3. A random duration between `minDurationMs` and `maxDurationMs` passes.
 * 4. `onIntervalEnd()` fires, `isShowingAd` becomes `false`.
 * 5. Automatically restarts the 2-hour countdown (step 1).
 *
 * Cleanup is handled automatically on unmount.
 */
export function useAdInterval({
  intervalMs = DEFAULT_INTERVAL_MS,
  minDurationMs = DEFAULT_MIN_DURATION_MS,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  onIntervalTrigger,
  onIntervalEnd,
}: UseAdIntervalOptions = {}): UseAdIntervalReturn {
  const [isShowingAd, setIsShowingAd] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  // Stable refs so callbacks captured in effects always see latest values.
  const onIntervalTriggerRef = useRef(onIntervalTrigger);
  const onIntervalEndRef = useRef(onIntervalEnd);
  useEffect(() => {
    onIntervalTriggerRef.current = onIntervalTrigger;
  }, [onIntervalTrigger]);
  useEffect(() => {
    onIntervalEndRef.current = onIntervalEnd;
  }, [onIntervalEnd]);

  // Timer IDs — kept in refs so they survive re-renders without stale closures.
  const intervalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timestamp when the current countdown started (for accurate `remainingMs`).
  const countdownStartRef = useRef<number>(0);
  const isRunningRef = useRef(false);

  /** Clear all active timers without updating state. */
  const clearAllTimers = useCallback(() => {
    if (intervalTimerRef.current !== null) {
      clearTimeout(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (adDurationTimerRef.current !== null) {
      clearTimeout(adDurationTimerRef.current);
      adDurationTimerRef.current = null;
    }
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  /** Pick a random display duration within [minDurationMs, maxDurationMs]. */
  const randomDurationMs = useCallback((): number => {
    const range = maxDurationMs - minDurationMs;
    return minDurationMs + Math.floor(Math.random() * (range + 1));
  }, [minDurationMs, maxDurationMs]);

  /**
   * Kick off the interval countdown (and the 1-second tick for `remainingMs`).
   * Declared with useCallback so `startInterval` below can reference it without
   * causing circular-ref issues.
   */
  const scheduleNextInterval = useCallback(() => {
    clearAllTimers();
    if (!isRunningRef.current) return;

    countdownStartRef.current = Date.now();
    setRemainingMs(intervalMs);

    // 1-second tick to update `remainingMs` for consumers.
    tickIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - countdownStartRef.current;
      const remaining = Math.max(0, intervalMs - elapsed);
      setRemainingMs(remaining);
    }, TICK_MS);

    // Main interval timer — fires when the 2-hour window is up.
    intervalTimerRef.current = setTimeout(() => {
      if (!isRunningRef.current) return;

      // Stop the tick counter and reset remainingMs.
      if (tickIntervalRef.current !== null) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      setRemainingMs(0);

      // Show the ad.
      setIsShowingAd(true);
      onIntervalTriggerRef.current?.();

      // Schedule ad dismissal after a random duration.
      const duration = randomDurationMs();
      adDurationTimerRef.current = setTimeout(() => {
        if (!isRunningRef.current) return;

        setIsShowingAd(false);
        onIntervalEndRef.current?.();

        // Restart the 2-hour countdown automatically.
        scheduleNextInterval();
      }, duration);
    }, intervalMs);
  }, [clearAllTimers, intervalMs, randomDurationMs]);

  const startInterval = useCallback(() => {
    // Idempotent: if already running, restart from scratch.
    isRunningRef.current = true;
    setIsShowingAd(false);
    scheduleNextInterval();
  }, [scheduleNextInterval]);

  const stopInterval = useCallback(() => {
    isRunningRef.current = false;
    clearAllTimers();
    setIsShowingAd(false);
    setRemainingMs(0);
  }, [clearAllTimers]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  return {
    startInterval,
    stopInterval,
    isShowingAd,
    remainingMs,
  };
}
