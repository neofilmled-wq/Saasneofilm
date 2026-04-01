'use client';

import { useState } from 'react';
import { Plus, Building2 } from 'lucide-react';
import { Button } from '@neofilm/ui';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { SiteList } from '@/components/sites/site-list';
import { CreateSiteDialog } from '@/components/sites/create-site-dialog';
import { EditSiteDialog } from '@/components/sites/edit-site-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useSites, useDeleteSite } from '@/hooks/use-sites';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import { useOrgPermissions } from '@/hooks/use-org-permissions';
import type { Site } from '@/hooks/use-sites';

export default function SitesPage() {
  const { orgId } = usePartnerOrg();
  const { data: sites, isLoading, isError, refetch } = useSites(orgId!);
  const deleteSite = useDeleteSite(orgId!);

  const permissions = useOrgPermissions();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Site | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Sites" description="Gérez vos emplacements et lieux d'installation">
        {permissions.canManageSites && (
          <Button className="rounded-xl" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un site
          </Button>
        )}
      </PageHeader>

      {sites && sites.length > 0 ? (
        <SiteList
          sites={sites}
          onEdit={(site) => setEditTarget(site)}
          onDelete={(site) => setDeleteTarget(site)}
        />
      ) : (
        <EmptyState
          icon={Building2}
          title="Aucun site"
          description="Commencez par ajouter votre premier site pour y installer des écrans."
          actionLabel="Ajouter un site"
          onAction={() => window.location.href = '/partner/sites/new'}
        />
      )}

      <CreateSiteDialog open={createOpen} onOpenChange={setCreateOpen} />

      <EditSiteDialog
        site={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />


      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer le site"
        description={`Êtes-vous sûr de vouloir supprimer "${deleteTarget?.name}" ? Cette action est irréversible.`}
        variant="destructive"
        confirmLabel="Supprimer"
        loading={deleteSite.isPending}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteSite.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
