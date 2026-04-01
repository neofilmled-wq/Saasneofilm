'use client';

import { Checkbox, Label, Button } from '@neofilm/ui';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';
import type { DiffusionTrigger } from '@/lib/mock-data';

const TRIGGERS: { value: DiffusionTrigger; label: string; description: string }[] = [
  { value: 'POWER_ON', label: 'Allumage TV', description: 'Quand l\'écran s\'allume' },
  { value: 'OPEN_APP', label: 'Ouverture app', description: 'Quand l\'application démarre' },
  { value: 'CHANGE_APP', label: 'Changement d\'app', description: 'Quand l\'utilisateur change d\'application' },
  { value: 'CATALOG_OPEN', label: 'Ouverture catalogue', description: 'Quand le catalogue est consulté' },
  { value: 'SCHEDULED', label: 'Programmé', description: 'Selon un planning horaire défini' },
];

const DURATIONS = [
  { value: 15, label: '15 secondes', desc: 'Format court — impact rapide' },
  { value: 30, label: '30 secondes', desc: 'Format standard — message détaillé' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function StepSchedule() {
  const { draft, updateDraft, nextStep, prevStep } = useCampaignWizard();

  function toggleTrigger(trigger: DiffusionTrigger) {
    const newTriggers = draft.triggers.includes(trigger)
      ? draft.triggers.filter((t) => t !== trigger)
      : [...draft.triggers, trigger];
    updateDraft({ triggers: newTriggers });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Règles de diffusion</h2>

      {/* Triggers */}
      <div className="space-y-3">
        <Label className="text-base">Déclencheurs *</Label>
        <p className="text-sm text-muted-foreground">Quand votre publicité sera diffusée</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRIGGERS.map((trigger) => (
            <label
              key={trigger.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-colors ${
                draft.triggers.includes(trigger.value)
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <Checkbox
                checked={draft.triggers.includes(trigger.value)}
                onCheckedChange={() => toggleTrigger(trigger.value)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">{trigger.label}</p>
                <p className="text-xs text-muted-foreground">{trigger.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className="space-y-3">
        <Label className="text-base">Durée du spot</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {DURATIONS.map((dur) => (
            <label
              key={dur.value}
              className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                draft.durationSeconds === dur.value
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <input
                type="radio"
                name="duration"
                value={dur.value}
                checked={draft.durationSeconds === dur.value}
                onChange={() => updateDraft({ durationSeconds: dur.value as 15 | 30 })}
                className="sr-only"
              />
              <p className="font-medium">{dur.label}</p>
              <p className="text-sm text-muted-foreground">{dur.desc}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Frequency cap */}
      <div className="space-y-3">
        <Label className="text-base">Fréquence maximale</Label>
        <p className="text-sm text-muted-foreground">
          Nombre maximum de diffusions par heure par écran
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={10}
            value={draft.frequencyCapPerHour}
            onChange={(e) => updateDraft({ frequencyCapPerHour: parseInt(e.target.value) })}
            className="flex-1"
          />
          <span className="w-24 rounded-lg border bg-muted/50 px-3 py-1.5 text-center text-sm font-medium">
            {draft.frequencyCapPerHour}x / heure
          </span>
        </div>
      </div>

      {/* Daily schedule preview */}
      <div className="space-y-3">
        <Label className="text-base">Aperçu planning journalier</Label>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex gap-px">
            {HOURS.map((hour) => {
              const isActive = hour >= 7 && hour <= 23;
              return (
                <div
                  key={hour}
                  className={`flex-1 rounded-sm ${isActive ? 'bg-primary/60' : 'bg-muted'}`}
                  style={{ height: 32 }}
                  title={`${hour}h - ${isActive ? 'Actif' : 'Inactif'}`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Diffusion active de 7h à 23h — {draft.frequencyCapPerHour} fois/heure/écran — Spots de {draft.durationSeconds}s
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>Précédent</Button>
        <Button onClick={nextStep} disabled={draft.triggers.length === 0}>Suivant</Button>
      </div>
    </div>
  );
}
