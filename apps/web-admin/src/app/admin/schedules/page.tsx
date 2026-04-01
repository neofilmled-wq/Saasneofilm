'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight, Ban } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type ScheduleBlackout } from '@/lib/admin-api';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('schedules');

  // --- Schedules ---
  const [schedulePage, setSchedulePage] = useState(1);
  const schedulesQuery = useQuery({
    queryKey: ['schedules', schedulePage],
    queryFn: () => adminApi.getSchedules({ page: schedulePage, limit: 20 }),
  });

  const schedules = schedulesQuery.data?.data?.data ?? [];
  const schedulesTotal = schedulesQuery.data?.data?.total ?? 0;
  const schedulesTotalPages = schedulesQuery.data?.data?.totalPages ?? 1;

  // --- Blackouts ---
  const [blackoutPage, setBlackoutPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBlackout, setNewBlackout] = useState({
    name: '',
    reason: '',
    startAt: '',
    endAt: '',
    screenId: '',
  });

  const blackoutsQuery = useQuery({
    queryKey: ['blackouts', blackoutPage],
    queryFn: () => adminApi.getBlackouts({ page: blackoutPage, limit: 20 }),
  });

  const blackouts = blackoutsQuery.data?.data?.data ?? [];
  const blackoutsTotal = blackoutsQuery.data?.data?.total ?? 0;
  const blackoutsTotalPages = blackoutsQuery.data?.data?.totalPages ?? 1;

  // Fetch screens for the select
  const screensQuery = useQuery({
    queryKey: ['screens-for-blackout'],
    queryFn: () => adminApi.getScreens({ limit: 100 }),
  });
  const screens = screensQuery.data?.data?.data ?? [];

  const createBlackoutMutation = useMutation({
    mutationFn: (data: { name: string; reason?: string; startAt: string; endAt: string; screenId?: string }) =>
      adminApi.createBlackout(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blackouts'] });
      toast.success('Blackout créé avec succès');
      setShowCreateDialog(false);
      setNewBlackout({ name: '', reason: '', startAt: '', endAt: '', screenId: '' });
    },
    onError: (error: Error) => {
      toast.error(`Erreur : ${error.message}`);
    },
  });

  const deleteBlackoutMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteBlackout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blackouts'] });
      toast.success('Blackout supprimé');
    },
    onError: (error: Error) => {
      toast.error(`Erreur : ${error.message}`);
    },
  });

  const handleCreateBlackout = () => {
    if (!newBlackout.name || !newBlackout.startAt || !newBlackout.endAt) {
      toast.error('Veuillez remplir les champs obligatoires');
      return;
    }
    const payload: { name: string; reason?: string; startAt: string; endAt: string; screenId?: string } = {
      name: newBlackout.name,
      startAt: new Date(newBlackout.startAt).toISOString(),
      endAt: new Date(newBlackout.endAt).toISOString(),
    };
    if (newBlackout.reason) payload.reason = newBlackout.reason;
    if (newBlackout.screenId && newBlackout.screenId !== 'global') {
      payload.screenId = newBlackout.screenId;
    }
    createBlackoutMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programmation"
        description="Gestion des grilles de diffusion et des créneaux"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="schedules">
            <Calendar className="h-4 w-4 mr-1.5" />
            Grilles de diffusion
          </TabsTrigger>
          <TabsTrigger value="blackouts">
            <Ban className="h-4 w-4 mr-1.5" />
            Blackouts
          </TabsTrigger>
        </TabsList>

        {/* Grilles de diffusion Tab */}
        <TabsContent value="schedules">
          <Card>
            <CardContent className="p-0">
              {schedulesQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : schedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">Aucune grille de diffusion</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Les grilles de diffusion apparaitront ici une fois créées par les partenaires.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom de la grille</TableHead>
                      <TableHead>Écran</TableHead>
                      <TableHead className="text-right">Créneaux</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Créée le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((schedule: any) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">{schedule.name}</TableCell>
                        <TableCell>{schedule.screen?.name ?? '—'}</TableCell>
                        <TableCell className="text-right">{schedule._count?.slots ?? 0}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              schedule.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {schedule.isActive ? 'Actif' : 'Inactif'}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(schedule.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Schedules Pagination */}
          {schedulesTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {schedulePage} sur {schedulesTotalPages} ({schedulesTotal} grille
                {schedulesTotal > 1 ? 's' : ''})
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={schedulePage <= 1}
                  onClick={() => setSchedulePage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={schedulePage >= schedulesTotalPages}
                  onClick={() => setSchedulePage((p) => p + 1)}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Blackouts Tab */}
        <TabsContent value="blackouts">
          <div className="flex justify-end mb-4">
            <Button className="gap-1.5" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Nouveau blackout
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {blackoutsQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : blackouts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Ban className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">Aucun blackout</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Les blackouts permettent de bloquer la diffusion sur un ou tous les écrans
                    pendant une période donnée.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Raison</TableHead>
                      <TableHead>Début</TableHead>
                      <TableHead>Fin</TableHead>
                      <TableHead>Écran</TableHead>
                      <TableHead>Créé par</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blackouts.map((blackout: ScheduleBlackout) => (
                      <TableRow key={blackout.id}>
                        <TableCell className="font-medium">{blackout.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {blackout.reason ?? '—'}
                        </TableCell>
                        <TableCell>{formatDateTime(blackout.startAt)}</TableCell>
                        <TableCell>{formatDateTime(blackout.endAt)}</TableCell>
                        <TableCell>
                          {blackout.screen ? (
                            <span className="text-sm">{blackout.screen.name}</span>
                          ) : (
                            <Badge variant="secondary">Global</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {blackout.createdBy
                            ? `${blackout.createdBy.firstName} ${blackout.createdBy.lastName}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={deleteBlackoutMutation.isPending}
                            onClick={() => deleteBlackoutMutation.mutate(blackout.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Blackouts Pagination */}
          {blackoutsTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {blackoutPage} sur {blackoutsTotalPages} ({blackoutsTotal} blackout
                {blackoutsTotal > 1 ? 's' : ''})
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={blackoutPage <= 1}
                  onClick={() => setBlackoutPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={blackoutPage >= blackoutsTotalPages}
                  onClick={() => setBlackoutPage((p) => p + 1)}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Blackout Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau blackout</DialogTitle>
            <DialogDescription>
              Bloquer la diffusion sur un ou tous les écrans pendant une période donnée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blackout-name">Nom *</Label>
              <Input
                id="blackout-name"
                placeholder="Ex: Maintenance serveur"
                value={newBlackout.name}
                onChange={(e) => setNewBlackout((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blackout-reason">Raison</Label>
              <Input
                id="blackout-reason"
                placeholder="Raison du blackout (optionnel)"
                value={newBlackout.reason}
                onChange={(e) => setNewBlackout((prev) => ({ ...prev, reason: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="blackout-start">Début *</Label>
                <Input
                  id="blackout-start"
                  type="datetime-local"
                  value={newBlackout.startAt}
                  onChange={(e) =>
                    setNewBlackout((prev) => ({ ...prev, startAt: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blackout-end">Fin *</Label>
                <Input
                  id="blackout-end"
                  type="datetime-local"
                  value={newBlackout.endAt}
                  onChange={(e) =>
                    setNewBlackout((prev) => ({ ...prev, endAt: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blackout-screen">Écran (optionnel)</Label>
              <Select
                value={newBlackout.screenId || 'global'}
                onValueChange={(value) =>
                  setNewBlackout((prev) => ({ ...prev, screenId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un écran" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (tous les écrans)</SelectItem>
                  {screens.map((screen) => (
                    <SelectItem key={screen.id} value={screen.id}>
                      {screen.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateBlackout}
              disabled={createBlackoutMutation.isPending}
            >
              {createBlackoutMutation.isPending ? 'Création...' : 'Créer le blackout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
