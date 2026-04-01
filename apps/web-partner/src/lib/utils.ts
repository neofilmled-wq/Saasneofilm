import { formatCurrency } from '@neofilm/shared';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export { formatCurrency };

export function formatDate(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: fr });
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: fr });
}

export function formatRelative(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

export type ScreenStatusColor = 'online' | 'offline' | 'degraded' | 'error' | 'maintenance' | 'inactive';

export function getStatusColor(status: ScreenStatusColor): string {
  const colors: Record<ScreenStatusColor, string> = {
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    degraded: 'bg-amber-500',
    error: 'bg-red-600',
    maintenance: 'bg-blue-500',
    inactive: 'bg-gray-400',
  };
  return colors[status] ?? 'bg-gray-400';
}

export function getStatusDotClass(status: ScreenStatusColor): string {
  const classes: Record<ScreenStatusColor, string> = {
    online: 'bg-emerald-500 shadow-emerald-500/50',
    offline: 'bg-red-500 shadow-red-500/50',
    degraded: 'bg-amber-500 animate-pulse shadow-amber-500/50',
    error: 'bg-red-600 animate-pulse shadow-red-600/50',
    maintenance: 'bg-blue-500 shadow-blue-500/50',
    inactive: 'bg-gray-400',
  };
  return classes[status] ?? 'bg-gray-400';
}

export function getStatusLabel(status: ScreenStatusColor): string {
  const labels: Record<ScreenStatusColor, string> = {
    online: 'En ligne',
    offline: 'Hors ligne',
    degraded: 'Dégradé',
    error: 'Erreur',
    maintenance: 'Maintenance',
    inactive: 'Inactif',
  };
  return labels[status] ?? 'Inconnu';
}

export function computeHealthScore(params: {
  uptimePercent24h: number;
  errorCount24h: number;
  minutesSinceHeartbeat: number;
}): number {
  const { uptimePercent24h, errorCount24h, minutesSinceHeartbeat } = params;
  let score = 100;
  score -= (100 - uptimePercent24h) * 0.5;
  score -= Math.min(errorCount24h * 5, 30);
  if (minutesSinceHeartbeat > 5) score -= Math.min((minutesSinceHeartbeat - 5) * 2, 30);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getHealthScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}
