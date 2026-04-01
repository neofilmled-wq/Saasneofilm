'use client';

import Link from 'next/link';
import { Calendar, Eye, MoreVertical, Copy } from 'lucide-react';
import {
  Card, CardContent, CardHeader,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Button,
} from '@neofilm/ui';
import { CampaignStatusBadge } from '@/components/common/status-badge';
import { formatCurrency, formatDate, formatNumber, formatRelative } from '@/lib/utils';
import type { MockCampaign } from '@/lib/mock-data';

interface CampaignCardProps {
  campaign: MockCampaign;
  onDuplicate?: (id: string) => void;
}

export function CampaignCard({ campaign, onDuplicate }: CampaignCardProps) {
  return (
    <Card className="group relative transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0 flex-1">
          <Link href={`/campaigns/${campaign.id}`} className="block">
            <h3 className="truncate font-semibold hover:text-primary">{campaign.name}</h3>
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatRelative(campaign.createdAt)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/campaigns/${campaign.id}`}>
                <Eye className="mr-2 h-4 w-4" /> Voir
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate?.(campaign.id)}>
              <Copy className="mr-2 h-4 w-4" /> Dupliquer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <CampaignStatusBadge status={campaign.status} />
        </div>

        {/* Thumbnail placeholder */}
        {campaign.creatives.length > 0 && (
          <div className="mb-3 aspect-video overflow-hidden rounded-md bg-muted">
            <img
              src={campaign.creatives[0].thumbnailUrl}
              alt={campaign.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="font-semibold">{formatNumber(campaign.impressions)}</p>
            <p className="text-muted-foreground">Diffusions</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="font-semibold">{campaign.screensCount}</p>
            <p className="text-muted-foreground">Écrans</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="font-semibold">{formatCurrency(campaign.budgetCents)}</p>
            <p className="text-muted-foreground">Budget</p>
          </div>
        </div>

        {/* Dates */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}
        </div>

        {/* Rejected reason */}
        {campaign.status === 'REJECTED' && campaign.reviewNotes && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {campaign.reviewNotes}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
