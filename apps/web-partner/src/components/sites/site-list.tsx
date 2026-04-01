'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@neofilm/ui';
import { MoreHorizontal, Pencil, Trash2, Monitor } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { Site } from '@/hooks/use-sites';

const CATEGORY_LABELS: Record<string, string> = {
  hotel: 'Hôtel',
  cinema: 'Cinéma',
  conciergerie: 'Conciergerie',
  airbnb: 'Airbnb',
  restaurant: 'Restaurant',
  other: 'Autre',
};

interface SiteListProps {
  sites: Site[];
  onEdit: (site: Site) => void;
  onDelete: (site: Site) => void;
}

export function SiteList({ sites, onEdit, onDelete }: SiteListProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Catégorie</TableHead>
            <TableHead>Ville</TableHead>
            <TableHead className="text-center">Écrans</TableHead>
            <TableHead>Créé le</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => (
            <TableRow key={site.id}>
              <TableCell className="font-medium">{site.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{CATEGORY_LABELS[site.category] ?? site.category}</Badge>
              </TableCell>
              <TableCell>{site.city}</TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{site.screenCount}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(site.createdAt)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(site)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(site)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
