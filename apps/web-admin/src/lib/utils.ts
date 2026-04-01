import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@neofilm/shared';

export { formatCurrency };

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy', { locale: fr });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy HH:mm', { locale: fr });
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

export function formatPercentage(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(n / 100);
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'bg-[hsl(152_60%_40%/0.12)] text-[hsl(152_60%_55%)] border border-[hsl(152_60%_40%/0.2)]',
    ONLINE: 'bg-[hsl(152_60%_40%/0.12)] text-[hsl(152_60%_55%)] border border-[hsl(152_60%_40%/0.2)]',
    PAID: 'bg-[hsl(152_60%_40%/0.12)] text-[hsl(152_60%_55%)] border border-[hsl(152_60%_40%/0.2)]',
    PENDING: 'bg-[hsl(38_92%_50%/0.12)] text-[hsl(38_85%_60%)] border border-[hsl(38_92%_50%/0.2)]',
    PENDING_REVIEW: 'bg-[hsl(24_95%_53%/0.12)] text-[hsl(24_95%_65%)] border border-[hsl(24_95%_53%/0.2)]',
    FINISHED: 'bg-[hsl(240_4%_14%)] text-[hsl(0_0%_60%)] border border-[hsl(240_4%_18%)]',
    OFFLINE: 'bg-[hsl(0_72%_51%/0.12)] text-[hsl(0_72%_65%)] border border-[hsl(0_72%_51%/0.2)]',
    REJECTED: 'bg-[hsl(0_72%_51%/0.12)] text-[hsl(0_72%_65%)] border border-[hsl(0_72%_51%/0.2)]',
    ERROR: 'bg-[hsl(0_72%_51%/0.12)] text-[hsl(0_72%_65%)] border border-[hsl(0_72%_51%/0.2)]',
    OVERDUE: 'bg-[hsl(0_72%_51%/0.12)] text-[hsl(0_72%_65%)] border border-[hsl(0_72%_51%/0.2)]',
    CANCELLED: 'bg-[hsl(240_4%_14%)] text-[hsl(0_0%_60%)] border border-[hsl(240_4%_18%)]',
    DECOMMISSIONED: 'bg-[hsl(240_4%_14%)] text-[hsl(0_0%_60%)] border border-[hsl(240_4%_18%)]',
    SUSPENDED: 'bg-[hsl(24_95%_53%/0.12)] text-[hsl(24_95%_65%)] border border-[hsl(24_95%_53%/0.2)]',
    PROVISIONING: 'bg-[hsl(220_60%_50%/0.12)] text-[hsl(220_60%_60%)] border border-[hsl(220_60%_50%/0.2)]',
  };
  return map[status] ?? 'bg-[hsl(240_4%_14%)] text-[hsl(0_0%_55%)] border border-[hsl(240_4%_18%)]';
}
