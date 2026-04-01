import type { CampaignStatus } from '@/lib/mock-data';

const statusConfig: Record<string, { label: string; colors: string; dot?: string }> = {
  PENDING_REVIEW: { label: 'En attente de vérification', colors: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  APPROVED: { label: 'Validée', colors: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  ACTIVE: { label: 'Active', colors: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  REJECTED: { label: 'Rejetée', colors: 'bg-red-50 text-red-700 border-red-200' },
  FINISHED: { label: 'Terminée', colors: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, colors: 'bg-gray-50 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.colors}`}>
      {config.dot && <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${config.dot}`} />}
      {config.label}
    </span>
  );
}

export function OnlineStatusDot({ isOnline }: { isOnline: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
      {isOnline ? 'En ligne' : 'Hors ligne'}
    </span>
  );
}
