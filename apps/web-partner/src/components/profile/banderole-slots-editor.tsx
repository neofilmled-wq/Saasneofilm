'use client';

import { useMemo } from 'react';
import {
  Wifi,
  Utensils,
  Clock,
  Coffee,
  QrCode,
  MapPin,
  Phone,
  Info,
  Star,
  Bed,
  Bath,
  Car,
  Dumbbell,
  Tv,
  Sparkles,
  Croissant,
  GlassWater,
  Plane,
  Ticket,
  KeyRound,
  Trash2,
  Plus,
} from 'lucide-react';
import { Button } from '@neofilm/ui';

/** Whitelist of available pill icons. Keep in sync with BanderoleIcon in the
 *  TV WebView so a value picked here always renders on the screen. */
export const ICON_OPTIONS: { id: string; label: string; Icon: typeof Wifi }[] = [
  { id: 'wifi', label: 'WiFi', Icon: Wifi },
  { id: 'utensils', label: 'Restaurant', Icon: Utensils },
  { id: 'clock', label: 'Horaires', Icon: Clock },
  { id: 'coffee', label: 'Café', Icon: Coffee },
  { id: 'qr', label: 'QR Code', Icon: QrCode },
  { id: 'mappin', label: 'Localisation', Icon: MapPin },
  { id: 'phone', label: 'Téléphone', Icon: Phone },
  { id: 'info', label: 'Info', Icon: Info },
  { id: 'star', label: 'Étoile', Icon: Star },
  { id: 'bed', label: 'Chambre', Icon: Bed },
  { id: 'bath', label: 'Salle de bain', Icon: Bath },
  { id: 'car', label: 'Parking', Icon: Car },
  { id: 'dumbbell', label: 'Gym', Icon: Dumbbell },
  { id: 'tv', label: 'TV', Icon: Tv },
  { id: 'sparkles', label: 'Spa', Icon: Sparkles },
  { id: 'croissant', label: 'Petit-déjeuner', Icon: Croissant },
  { id: 'glass', label: 'Bar', Icon: GlassWater },
  { id: 'plane', label: 'Transfert', Icon: Plane },
  { id: 'ticket', label: 'Billet', Icon: Ticket },
  { id: 'key', label: 'Check-in / Check-out', Icon: KeyRound },
];

const ICON_MAP = ICON_OPTIONS.reduce<Record<string, typeof Wifi>>((acc, opt) => {
  acc[opt.id] = opt.Icon;
  return acc;
}, {});

export type BanderoleSlot = { icon: string; label: string };

interface BanderoleSlotsEditorProps {
  value: BanderoleSlot[];
  onChange: (slots: BanderoleSlot[]) => void;
}

const MAX_SLOTS = 3;

/**
 * Three customizable pill slots that appear on the right side of the TV
 * bottom banner. Each slot has a Lucide icon (picked from a curated list)
 * and a short label (e.g. "WiFi : NEOFILM_5G", "Check-out 11h").
 *
 * Empty rows are filtered out before save so the schema never carries
 * { icon: '', label: '' } placeholders.
 */
export function BanderoleSlotsEditor({ value, onChange }: BanderoleSlotsEditorProps) {
  // Always render 3 rows in the UI even if value has fewer — feels nicer
  // than having an "add" button for such a tiny fixed cap. Empty rows are
  // stripped at submit time.
  const rows = useMemo<BanderoleSlot[]>(() => {
    const filled = [...value];
    while (filled.length < MAX_SLOTS) filled.push({ icon: '', label: '' });
    return filled.slice(0, MAX_SLOTS);
  }, [value]);

  function update(index: number, patch: Partial<BanderoleSlot>) {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  }

  function clear(index: number) {
    update(index, { icon: '', label: '' });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Jusqu&apos;à 3 informations s&apos;affichent en bas à droite des écrans TV de votre logement
        (WiFi, horaires, transfert, etc.). Laissez vide pour ne rien afficher.
      </p>

      {rows.map((slot, i) => {
        const Preview = slot.icon ? ICON_MAP[slot.icon] ?? null : null;
        return (
          <div key={i} className="flex items-end gap-2">
            <div className="grid gap-1.5 flex-1 min-w-0">
              <label className="text-xs font-medium text-muted-foreground">
                Emplacement {i + 1}
              </label>
              <div className="flex gap-2">
                <select
                  value={slot.icon}
                  onChange={(e) => update(i, { icon: e.target.value })}
                  className="rounded-md border bg-background px-2 py-2 text-sm w-44"
                >
                  <option value="">— icône —</option>
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={slot.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder={
                    i === 0
                      ? 'ex. WiFi : NEOFILM_5G'
                      : i === 1
                        ? 'ex. Petit-déj. de 7h à 10h'
                        : 'ex. Check-out 11h'
                  }
                  maxLength={48}
                  className="rounded-md border bg-background px-3 py-2 text-sm flex-1 min-w-0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pb-1">
              {Preview && (
                <div className="rounded-md border bg-muted/50 px-2 py-1.5 text-xs flex items-center gap-1.5 text-muted-foreground">
                  <Preview className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[8rem]">{slot.label || '—'}</span>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clear(i)}
                disabled={!slot.icon && !slot.label}
                title="Vider cet emplacement"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Plus className="h-3 w-3" /> {MAX_SLOTS} emplacements max. — texte court (~48 caractères).
      </p>
    </div>
  );
}
