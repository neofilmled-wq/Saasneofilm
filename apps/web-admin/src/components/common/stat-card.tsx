import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp }: StatCardProps) {
  return (
    <div className="chirp-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="chirp-kpi-label">{title}</p>
          <p className="chirp-kpi-value text-[24px] mt-1">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 font-semibold ${trendUp ? 'text-[hsl(152_60%_50%)]' : 'text-[hsl(0_72%_60%)]'}`}>
              {trendUp ? '+' : ''}{trend}
            </p>
          )}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
