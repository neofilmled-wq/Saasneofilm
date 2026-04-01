'use client';

import { Building2, Mail, Phone, MapPin, Clock, XCircle, Archive, RotateCcw } from 'lucide-react';
import { Button, Badge } from '@neofilm/ui';

interface ConversationInfoProps {
  conversation: {
    id: string;
    subject: string | null;
    status: string;
    createdAt: string;
    lastMessageAt: string;
    organization: {
      name: string;
      type: string;
      contactEmail?: string;
      contactPhone?: string;
      city?: string;
    };
    createdBy?: { firstName: string; lastName: string; email?: string };
    participants: {
      userId: string;
      role: string;
      user: { firstName: string; lastName: string; platformRole: string | null };
    }[];
  };
  onClose: () => void;
  onArchive: () => void;
  onReopen: () => void;
  isActioning: boolean;
}

export function ConversationInfo({
  conversation,
  onClose,
  onArchive,
  onReopen,
  isActioning,
}: ConversationInfoProps) {
  const statusLabel = (s: string) => {
    switch (s) {
      case 'OPEN': return 'Ouvert';
      case 'CLOSED': return 'Fermé';
      case 'ARCHIVED': return 'Archivé';
      default: return s;
    }
  };

  const statusVariant = (s: string) => {
    switch (s) {
      case 'OPEN': return 'default' as const;
      case 'CLOSED': return 'secondary' as const;
      case 'ARCHIVED': return 'outline' as const;
      default: return 'secondary' as const;
    }
  };

  const org = conversation.organization;

  return (
    <div className="flex h-full w-72 flex-col border-l bg-card">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">Informations</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Status */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Statut</label>
          <div className="mt-1">
            <Badge variant={statusVariant(conversation.status)} className="text-xs">
              {statusLabel(conversation.status)}
            </Badge>
          </div>
        </div>

        {/* Organization */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Organisation</label>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{org.name}</span>
          </div>
          <Badge variant={org.type === 'PARTNER' ? 'secondary' : 'outline'} className="text-[10px]">
            {org.type === 'PARTNER' ? 'Partenaire' : 'Annonceur'}
          </Badge>
          {org.contactEmail && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              {org.contactEmail}
            </div>
          )}
          {org.contactPhone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {org.contactPhone}
            </div>
          )}
          {org.city && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {org.city}
            </div>
          )}
        </div>

        {/* Creator */}
        {conversation.createdBy && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Créée par</label>
            <p className="text-sm mt-1">
              {conversation.createdBy.firstName} {conversation.createdBy.lastName}
            </p>
            {conversation.createdBy.email && (
              <p className="text-xs text-muted-foreground">{conversation.createdBy.email}</p>
            )}
          </div>
        )}

        {/* Dates */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Créée le {new Date(conversation.createdAt).toLocaleDateString('fr-FR')}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Dernier msg {new Date(conversation.lastMessageAt).toLocaleString('fr-FR')}
          </div>
        </div>

        {/* Participants */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Participants</label>
          <ul className="mt-1 space-y-1">
            {conversation.participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <span className="h-6 w-6 flex items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                  {p.user.firstName[0]}{p.user.lastName[0]}
                </span>
                {p.user.firstName} {p.user.lastName}
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {p.role === 'ADMIN' ? 'Admin' : 'Demandeur'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t p-4 space-y-2">
        {conversation.status === 'OPEN' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onClose}
              disabled={isActioning}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Fermer
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onArchive}
              disabled={isActioning}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archiver
            </Button>
          </>
        )}
        {conversation.status === 'CLOSED' && (
          <>
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={onReopen}
              disabled={isActioning}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Réouvrir
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onArchive}
              disabled={isActioning}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archiver
            </Button>
          </>
        )}
        {conversation.status === 'ARCHIVED' && (
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={onReopen}
            disabled={isActioning}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Réouvrir
          </Button>
        )}
      </div>
    </div>
  );
}
