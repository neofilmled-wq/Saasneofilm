'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Android TV remote key → action mapping.
 * Covers both standard keyboard and Android TV WebView keycodes.
 */
const KEY_TO_ACTION: Record<string, string> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Enter: 'SELECT',
  ' ': 'SELECT',
  Escape: 'BACK',
  Backspace: 'BACK',
  GoBack: 'BACK',
};

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface DpadOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  onBack?: () => void;
  focusAttr?: string;
  initialIndex?: number;
  autoFocus?: boolean;
  wrap?: boolean;
  enabled?: boolean;
  columns?: number;
}

interface DpadControls {
  focusFirst: () => void;
  focusElement: (el: HTMLElement) => void;
  getFocusables: () => HTMLElement[];
  focusAt: (index: number) => void;
}

/**
 * useDpadNavigation — TV remote D-pad navigation manager.
 *
 * Registers a global keydown listener and routes arrow keys, Enter, and
 * Escape/Backspace within the container's [data-tv-focusable] elements.
 *
 * Score = primaryAxisDist + secondaryAxisDist * 2
 * Prefers aligned elements over diagonal jumps.
 */
export function useDpadNavigation({
  containerRef,
  onBack,
  focusAttr = 'data-tv-focusable',
  initialIndex = 0,
  autoFocus = false,
  wrap = false,
  enabled = true,
}: DpadOptions): DpadControls {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const getFocusables = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(`[${focusAttr}]`),
    ).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        !(el as HTMLButtonElement).disabled &&
        getComputedStyle(el).display !== 'none' &&
        getComputedStyle(el).visibility !== 'hidden',
    );
  }, [containerRef, focusAttr]);

  const focusElement = useCallback((el: HTMLElement) => {
    el.focus({ preventScroll: false });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, []);

  const focusAt = useCallback(
    (index: number) => {
      const els = getFocusables();
      const target = els[Math.max(0, Math.min(index, els.length - 1))];
      if (target) focusElement(target);
    },
    [getFocusables, focusElement],
  );

  const focusFirst = useCallback(() => {
    const els = getFocusables();
    const target = els[Math.min(initialIndex, els.length - 1)];
    if (target) focusElement(target);
  }, [getFocusables, focusElement, initialIndex]);

  const findNearest = useCallback(
    (current: HTMLElement, direction: Direction): HTMLElement | null => {
      const focusables = getFocusables();
      const cr = current.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;

      let best: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const el of focusables) {
        if (el === current) continue;
        const r = el.getBoundingClientRect();
        const ex = r.left + r.width / 2;
        const ey = r.top + r.height / 2;
        const dx = ex - cx;
        const dy = ey - cy;

        const inDir =
          direction === 'UP'   ? dy < -4 :
          direction === 'DOWN' ? dy > 4 :
          direction === 'LEFT' ? dx < -4 :
                                 dx > 4;

        if (!inDir) continue;

        const primary =
          direction === 'UP'   ? cy - ey :
          direction === 'DOWN' ? ey - cy :
          direction === 'LEFT' ? cx - ex :
                                 ex - cx;

        const secondary =
          direction === 'UP' || direction === 'DOWN' ? Math.abs(dx) : Math.abs(dy);

        const score = primary + secondary * 2;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }

      return best;
    },
    [getFocusables],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabledRef.current) return;

      const action = KEY_TO_ACTION[e.key];
      if (!action) return;

      if (action === 'BACK') {
        if (onBack) {
          e.preventDefault();
          onBack();
        }
        return;
      }

      const focusables = getFocusables();
      if (focusables.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const inContainer = !!active && !!containerRef.current?.contains(active);

      if (!inContainer || !focusables.includes(active!)) {
        e.preventDefault();
        focusElement(focusables[0]);
        return;
      }

      if (action === 'SELECT') return;

      const direction = action as Direction;
      const nearest = findNearest(active!, direction);

      if (nearest) {
        e.preventDefault();
        focusElement(nearest);
      } else if (wrap) {
        e.preventDefault();
        if (direction === 'DOWN' || direction === 'RIGHT') {
          focusElement(focusables[0]);
        } else {
          focusElement(focusables[focusables.length - 1]);
        }
      }
    },
    [containerRef, getFocusables, focusElement, findNearest, onBack, wrap],
  );

  // Disabled in legacy — MainActivity handles D-pad navigation natively
  // useEffect(() => {
  //   window.addEventListener('keydown', handleKeyDown);
  //   return () => window.removeEventListener('keydown', handleKeyDown);
  // }, [handleKeyDown]);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(focusFirst, 80);
      return () => clearTimeout(t);
    }
  }, [autoFocus, focusFirst]);

  return { focusFirst, focusElement, getFocusables, focusAt };
}
