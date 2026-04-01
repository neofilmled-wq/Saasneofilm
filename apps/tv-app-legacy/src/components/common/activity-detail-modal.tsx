'use client';

import { useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityDetailItem {
  id: string;
  title: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  address?: string;
  ctaUrl?: string;
  promoCode?: string;
  sponsored?: boolean;
  badgeText?: string;
}

export interface ActivityDetailModalProps {
  item: ActivityDetailItem | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ActivityDetailModal — full-screen overlay modal for a catalogue/activity item.
 *
 * D-pad behaviour:
 * - Escape / Backspace → onClose()
 * - Focus lands on the "Fermer" button at mount (Android TV back button maps to Escape)
 *
 * Renders nothing when `item` is null.
 */
export function ActivityDetailModal({ item, onClose }: ActivityDetailModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the close button so the user can immediately dismiss with Enter/Back.
  useEffect(() => {
    if (item) {
      closeButtonRef.current?.focus();
    }
  }, [item]);

  // Global keyboard handler for Escape / Backspace.
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  // Do not render anything if there's no item to display.
  if (!item) return null;

  return (
    /* Overlay ---------------------------------------------------------------- */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      onClick={(e) => {
        // Close when clicking the backdrop (outside the modal card).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal card ---------------------------------------------------------- */}
      <div className="relative flex w-full max-w-3xl flex-col overflow-hidden bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">

        {/* Image banner ------------------------------------------------------- */}
        {item.imageUrl && (
          <div className="relative h-56 w-full shrink-0 overflow-hidden bg-gray-800">
            <img
              src={item.imageUrl}
              alt={item.title}
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />

            {/* Gradient overlay for text legibility */}
            <div className="absolute inset-0 bg-linear-to-t from-gray-900/80 to-transparent" />
          </div>
        )}

        {/* Content area ------------------------------------------------------- */}
        <div className="flex flex-col gap-4 px-8 py-6">

          {/* Header row — sponsored badge + category */}
          <div className="flex items-center gap-3 flex-wrap">
            {item.sponsored && (
              <span className="rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-black uppercase tracking-wide select-none">
                {item.badgeText ?? 'Sponsorisé'}
              </span>
            )}
            {item.category && (
              <span className="rounded-full border border-gray-600 px-3 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide select-none">
                {item.category}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-3xl font-bold text-white leading-tight">
            {item.title}
          </h2>

          {/* Address */}
          {item.address && (
            <p className="flex items-center gap-2 text-gray-400 text-base">
              <span aria-hidden="true">📍</span>
              {item.address}
            </p>
          )}

          {/* Description */}
          {item.description && (
            <p className="text-gray-300 text-base leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Promo code — displayed prominently */}
          {item.promoCode && (
            <div className="flex flex-col gap-1 mt-2">
              <span className="text-xs uppercase tracking-widest text-gray-500 select-none">
                Code promo
              </span>
              <span className="font-mono text-3xl text-green-400 bg-gray-800 px-6 py-3 rounded-xl tracking-widest w-fit select-all">
                {item.promoCode}
              </span>
            </div>
          )}

          {/* CTA URL — shown as informational text (TV cannot open a browser) */}
          {item.ctaUrl && (
            <p className="text-gray-500 text-sm mt-1 break-all">
              <span className="text-gray-600">En savoir plus : </span>
              <span className="text-blue-400">{item.ctaUrl}</span>
            </p>
          )}

          {/* Action row -------------------------------------------------------- */}
          <div className="flex justify-end pt-2 border-t border-gray-800 mt-2">
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className={[
                'flex items-center gap-2 rounded-xl px-8 py-3',
                'bg-gray-700 hover:bg-gray-600 text-white font-semibold text-lg',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900',
              ].join(' ')}
            >
              <span aria-hidden="true">✕</span>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
