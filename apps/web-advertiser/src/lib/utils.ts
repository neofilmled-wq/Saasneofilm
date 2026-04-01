import { formatCurrency as sharedFormatCurrency } from '@neofilm/shared';
import { formatDistanceToNow, format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function formatCurrency(cents: number, currency = 'EUR') {
  return sharedFormatCurrency(cents, currency);
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy', { locale: fr });
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy HH:mm', { locale: fr });
}

export function formatRelative(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

export function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${seconds}s`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n);
}

export function formatPercentage(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
