import type { LucideIcon } from 'lucide-react';
import { cn } from '@neofilm/ui';

type StatVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  variant?: StatVariant;
  className?: string;
}

const VARIANT_CLASS: Record<StatVariant, string> = {
  default: 'bg-card card-elevated',
  primary: 'stat-card-primary',
  success: 'stat-card-success',
  warning: 'stat-card-warning',
  danger: 'stat-card-danger',
};

export function StatCard({ label, value, icon: Icon, trend, variant = 'default', className }: StatCardProps) {
  const isGradient = variant !== 'default';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-6 transition-all duration-200',
        VARIANT_CLASS[variant],
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className={cn(
            'text-sm font-medium',
            isGradient ? 'stat-label' : 'text-muted-foreground',
          )}>
            {label}
          </p>
          <p className={cn(
            'text-3xl font-bold tracking-tight',
            isGradient ? 'text-white' : 'text-foreground',
          )}>
            {value}
          </p>
          {trend && (
            <p className={cn(
              'text-xs font-medium',
              isGradient
                ? 'stat-trend'
                : trend.positive ? 'text-[hsl(var(--success))]' : 'text-destructive',
            )}>
              {trend.positive ? '↑ ' : '↓ '}{trend.value}
              <span className={cn(
                'ml-1',
                isGradient ? 'text-white/60' : 'text-muted-foreground',
              )}>
                vs mois dernier
              </span>
            </p>
          )}
        </div>
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
          isGradient
            ? 'bg-white/15'
            : 'bg-primary/8',
        )}>
          <Icon className={cn(
            'h-5 w-5',
            isGradient ? 'text-white' : 'text-primary',
          )} />
        </div>
      </div>
    </div>
  );
}
