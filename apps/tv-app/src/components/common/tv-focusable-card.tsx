'use client';

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';

interface TVFocusableCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant controlling size/glow intensity */
  variant?: 'default' | 'hero' | 'service' | 'channel';
  /** Show selected/active border even when not focused */
  isActive?: boolean;
  /** Custom glow color override (CSS color value) */
  glowColor?: string;
}

/**
 * TVFocusableCard — TV-safe interactive card.
 *
 * - Adds `data-tv-focusable` for D-pad navigation pickup
 * - Premium focus ring with glow via CSS (.tv-card class in globals.css)
 * - Scale + border animation on focus
 * - Variants: default | hero | service | channel
 */
export const TVFocusableCard = forwardRef<HTMLButtonElement, TVFocusableCardProps>(
  (
    {
      children,
      className = '',
      variant = 'default',
      isActive,
      glowColor,
      style,
      ...props
    },
    ref,
  ) => {
    const glowStyle: CSSProperties = glowColor
      ? ({
          '--tv-card-glow': glowColor,
        } as CSSProperties)
      : {};

    return (
      <button
        ref={ref}
        data-tv-focusable
        data-tv-active={isActive ? 'true' : undefined}
        className={`tv-card tv-card--${variant} ${className}`}
        style={{ ...glowStyle, ...style }}
        {...props}
      />
    );
  },
);

TVFocusableCard.displayName = 'TVFocusableCard';
