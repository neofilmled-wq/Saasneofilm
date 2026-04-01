'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, MoreHorizontal, Pencil, KeyRound, UserX, UserCheck, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button, Card, CardContent, Input, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Skeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Switch, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { adminApi, type AdminUser } from '@/lib/admin-api';
import { useAuth } from '@/providers/auth-provider';
import { useAdminSocket } from '@/hooks/use-admin-socket';
import { formatDate, formatRelative } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SUPPORT: 'Support',
};

const EMPTY_FORM = { firstName: '', lastName: '', email: '', platformRole: 'ADMIN', isActive: true, password: '', autoGeneratePassword: false };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { connected } = useAdminSocket();
  const queryClient = useQueryClient();

  // Search with proper debounce
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Filters + pagination
  const [roleFilter, setRoleFilter] = useState<string>('__all__');
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  const [page, setPage] = useState(1);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);

  // Create form state (simple state, not react-hook-form — more reliable with Radix Dialog)
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // ─── Query ────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', debouncedSearch, page, roleFilter, statusFilter],
    queryFn: () => adminApi.getUsers({
      q: debouncedSearch || undefined,
      page,
      limit: 20,
      platformRole: roleFilter !== '__all__' ? roleFilter : undefined,
      isActive: statusFilter !== '__all__' ? statusFilter : undefined,
    }),
    refetchInterval: connected ? false : 15_000,
  });

  const users = data?.data?.data || [];
  const totalPages = data?.data?.totalPages || 1;

  // ─── Mutations ────────────────────────────────

  const createMutation = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      setCreateErrors({});
      const tempPwd = (res as any)?.data?.temporaryPassword;
      if (tempPwd) {
        toast.success(`Utilisateur créé. Mot de passe temporaire: ${tempPwd}`, { duration: 10000 });
      } else {
        toast.success('Utilisateur créé avec succès');
      }
    },
    onError: (err: any) => toast.error(err.message || 'Erreur lors de la création'),
  });

  const resetPwdMutation = useMutation({
    mutationFn: (userId: string) => adminApi.resetPassword(userId),
    onSuccess: (res) => {
      const pwd = (res as any)?.data?.temporaryPassword;
      toast.success(`Mot de passe réinitialisé: ${pwd}`, { duration: 10000 });
    },
    onError: (err: any) => toast.error(err.message || 'Erreur'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'suspend' | 'activate' }) =>
      action === 'suspend' ? adminApi.suspendUser(userId) : adminApi.activateUser(userId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(vars.action === 'suspend' ? 'Utilisateur suspendu' : 'Utilisateur activé');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeleteConfirm(null);
      toast.success('Utilisateur supprimé');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditUser(null);
      toast.success('Utilisateur mis à jour');
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Create form handlers ────────────────────

  function openCreateDialog() {
    setCreateForm(EMPTY_FORM);
    setCreateErrors({});
    setCreateOpen(true);
  }

  function validateAndSubmitCreate(e: React.FormEvent) {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!createForm.firstName.trim()) errors.firstName = 'Prénom requis';
    if (!createForm.lastName.trim()) errors.lastName = 'Nom requis';
    if (!createForm.email.trim() || !createForm.email.includes('@')) errors.email = 'Email invalide';
    if (!createForm.autoGeneratePassword && (!createForm.password || createForm.password.length < 8)) {
      errors.password = 'Minimum 8 caractères';
    }
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) return;

    createMutation.mutate({
      firstName: createForm.firstName.trim(),
      lastName: createForm.lastName.trim(),
      email: createForm.email.trim(),
      platformRole: createForm.platformRole,
      isActive: createForm.isActive,
      password: createForm.autoGeneratePassword ? undefined : createForm.password,
      autoGeneratePassword: createForm.autoGeneratePassword,
    });
  }

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // ─── Render ───────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Utilisateurs"
          description="Gestion des comptes utilisateurs de la plateforme"
        />
        <Button className="gap-1.5" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" /> Nouvel utilisateur
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4">
        {connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            Polling
          </span>
        )}

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Rôle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous les rôles</SelectItem>
            <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="SUPPORT">Support</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous</SelectItem>
            <SelectItem value="true">Actif</SelectItem>
            <SelectItem value="false">Suspendu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">Aucun utilisateur trouvé</p>
              <p className="text-sm mt-1">Modifiez vos critères de recherche ou créez un nouvel utilisateur.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Inscrit le</TableHead>
                  <TableHead>Dernière connexion</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user: AdminUser) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABELS[user.platformRole || ''] || user.platformRole || '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'default' : 'destructive'}>
                        {user.isActive ? 'Actif' : 'Suspendu'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{user.lastLoginAt ? formatRelative(user.lastLoginAt) : '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditUser(user)}>
                            <Pencil className="mr-2 h-4 w-4" /> Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => resetPwdMutation.mutate(user.id)}>
                            <KeyRound className="mr-2 h-4 w-4" /> Réinitialiser mot de passe
                          </DropdownMenuItem>
                          {user.isActive ? (
                            <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ userId: user.id, action: 'suspend' })}>
                              <UserX className="mr-2 h-4 w-4" /> Suspendre
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ userId: user.id, action: 'activate' })}>
                              <UserCheck className="mr-2 h-4 w-4" /> Activer
                            </DropdownMenuItem>
                          )}
                          {isSuperAdmin && (
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm(user)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} sur {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Suivant <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Create User Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvel utilisateur</DialogTitle>
            <DialogDescription>Créer un nouveau compte utilisateur admin</DialogDescription>
          </DialogHeader>
          <form onSubmit={validateAndSubmitCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input
                  value={createForm.firstName}
                  onChange={(e) => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                />
                {createErrors.firstName && <p className="text-xs text-destructive">{createErrors.firstName}</p>}
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={createForm.lastName}
                  onChange={(e) => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                />
                {createErrors.lastName && <p className="text-xs text-destructive">{createErrors.lastName}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
              />
              {createErrors.email && <p className="text-xs text-destructive">{createErrors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select
                value={createForm.platformRole}
                onValueChange={(v) => setCreateForm(f => ({ ...f, platformRole: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPPORT">Support</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Compte actif</Label>
              <Switch
                checked={createForm.isActive}
                onCheckedChange={(v) => setCreateForm(f => ({ ...f, isActive: v }))}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Générer mot de passe automatiquement</Label>
              <Switch
                checked={createForm.autoGeneratePassword}
                onCheckedChange={(v) => setCreateForm(f => ({ ...f, autoGeneratePassword: v }))}
              />
            </div>
            {!createForm.autoGeneratePassword && (
              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                />
                {createErrors.password && <p className="text-xs text-destructive">{createErrors.password}</p>}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Création...' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Edit User Dialog ─── */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          {editUser && (
            <EditUserForm
              user={editUser}
              onSubmit={(data) => editMutation.mutate({ id: editUser.id, data })}
              isPending={editMutation.isPending}
              onCancel={() => setEditUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer {deleteConfirm?.firstName} {deleteConfirm?.lastName} ({deleteConfirm?.email}) ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Edit Form Sub-component ─────────────────
function EditUserForm({ user, onSubmit, isPending, onCancel }: {
  user: AdminUser;
  onSubmit: (data: any) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [role, setRole] = useState(user.platformRole || 'ADMIN');
  const [isActive, setIsActive] = useState(user.isActive);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Prénom</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Nom</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Rôle</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="SUPPORT">Support</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label>Compte actif</Label>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button disabled={isPending} onClick={() => onSubmit({ firstName, lastName, platformRole: role, isActive })}>
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </div>
  );
}
