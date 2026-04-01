import { getStatusColor } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  label?: string;
  dot?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  ONLINE: 'En ligne',
  OFFLINE: 'Hors ligne',
  PENDING: 'En attente',
  PENDING_REVIEW: 'En révision',
  FINISHED: 'Terminé',
  REJECTED: 'Rejeté',
  ERROR: 'Erreur',
  PAID: 'Payé',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulé',
  SUSPENDED: 'Suspendu',
  DECOMMISSIONED: 'Décommissionné',
  PROVISIONING: 'Provisionnement',
};

const DOT_COLORS: Record<string, string> = {
  ACTIVE: 'bg-[hsl(152_60%_45%)] shadow-[0_0_4px_hsl(152_60%_45%/0.5)]',
  ONLINE: 'bg-[hsl(152_60%_45%)] shadow-[0_0_4px_hsl(152_60%_45%/0.5)]',
  PAID: 'bg-[hsl(152_60%_45%)] shadow-[0_0_4px_hsl(152_60%_45%/0.5)]',
  PENDING: 'bg-[hsl(38_92%_50%)]',
  PENDING_REVIEW: 'bg-[hsl(24_95%_53%)] shadow-[0_0_4px_hsl(24_95%_53%/0.5)]',
  OFFLINE: 'bg-[hsl(0_72%_55%)]',
  REJECTED: 'bg-[hsl(0_72%_55%)]',
  ERROR: 'bg-[hsl(0_72%_55%)] shadow-[0_0_4px_hsl(0_72%_55%/0.5)]',
  OVERDUE: 'bg-[hsl(0_72%_55%)]',
};

export function StatusBadge({ status, label, dot = true }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(status)}`}>
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[status] ?? 'bg-[hsl(0_0%_40%)]'}`} />
      )}
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}
