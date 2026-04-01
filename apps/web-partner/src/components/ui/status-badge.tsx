import { Badge } from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import { getStatusLabel, type ScreenStatusColor } from '@/lib/utils';

interface StatusBadgeProps {
  status: ScreenStatusColor;
  className?: string;
}

const variantMap: Record<ScreenStatusColor, string> = {
  online: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  offline: 'bg-red-100 text-red-800 border-red-200',
  degraded: 'bg-amber-100 text-amber-800 border-amber-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  maintenance: 'bg-blue-100 text-blue-800 border-blue-200',
  inactive: 'bg-gray-100 text-gray-800 border-gray-200',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs font-medium',
        variantMap[status],
        className,
      )}
    >
      <span className={cn(
        'mr-1.5 h-1.5 w-1.5 rounded-full inline-block',
        status === 'online' && 'bg-emerald-500',
        status === 'offline' && 'bg-red-500',
        status === 'degraded' && 'bg-amber-500 animate-pulse',
        status === 'error' && 'bg-red-600 animate-pulse',
        status === 'maintenance' && 'bg-blue-500',
        status === 'inactive' && 'bg-gray-500',
      )} />
      {getStatusLabel(status)}
    </Badge>
  );
}
