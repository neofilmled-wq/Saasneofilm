'use client';

import { useForm } from 'react-hook-form';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@neofilm/ui';
import {
  Building2,
  CreditCard,
  Users,
  CheckCircle2,
  Plus,
  Pencil,
  Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useOrgPermissions } from '@/hooks/use-org-permissions';

const MOCK_TEAM = [
  { id: '1', name: 'Jean Dupont', email: 'jean@hotel-marais.fr', role: 'OWNER', joinedAt: '2025-12-01' },
  { id: '2', name: 'Marie Martin', email: 'marie@hotel-marais.fr', role: 'ADMIN', joinedAt: '2025-12-15' },
  { id: '3', name: 'Pierre Bernard', email: 'pierre@hotel-marais.fr', role: 'MANAGER', joinedAt: '2026-01-10' },
  { id: '4', name: 'Sophie Petit', email: 'sophie@hotel-marais.fr', role: 'MEMBER', joinedAt: '2026-02-01' },
];

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  MANAGER: 'Manager',
  MEMBER: 'Membre',
  VIEWER: 'Lecteur',
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-800',
  ADMIN: 'bg-blue-100 text-blue-800',
  MANAGER: 'bg-emerald-100 text-emerald-800',
  MEMBER: 'bg-gray-100 text-gray-800',
  VIEWER: 'bg-gray-100 text-gray-600',
};

export default function SettingsPage() {
  const permissions = useOrgPermissions();

  const orgForm = useForm({
    defaultValues: {
      name: 'Hôtel Le Marais',
      contactEmail: 'contact@hotel-marais.fr',
      contactPhone: '+33 1 42 72 34 56',
      address: '15 Rue des Archives',
      city: 'Paris',
      postCode: '75004',
      country: 'FR',
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Gérez votre organisation, la facturation et votre équipe" />

      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">
            <Building2 className="mr-2 h-4 w-4" />
            Organisation
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="mr-2 h-4 w-4" />
            Paiement
          </TabsTrigger>
          {permissions.canManageTeam && (
            <TabsTrigger value="team">
              <Users className="mr-2 h-4 w-4" />
              Équipe
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="org" className="mt-6">
          <Card className="rounded-2xl card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Informations de l'organisation</CardTitle>
              <CardDescription>Mettez à jour les informations de votre organisation</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4 max-w-lg">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input {...orgForm.register('name')} disabled={!permissions.canEditOrgSettings} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email de contact</Label>
                    <Input {...orgForm.register('contactEmail')} disabled={!permissions.canEditOrgSettings} />
                  </div>
                  <div className="space-y-2">
                    <Label>Téléphone</Label>
                    <Input {...orgForm.register('contactPhone')} disabled={!permissions.canEditOrgSettings} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Adresse</Label>
                  <Input {...orgForm.register('address')} disabled={!permissions.canEditOrgSettings} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Ville</Label>
                    <Input {...orgForm.register('city')} disabled={!permissions.canEditOrgSettings} />
                  </div>
                  <div className="space-y-2">
                    <Label>Code postal</Label>
                    <Input {...orgForm.register('postCode')} disabled={!permissions.canEditOrgSettings} />
                  </div>
                  <div className="space-y-2">
                    <Label>Pays</Label>
                    <Input {...orgForm.register('country')} disabled={!permissions.canEditOrgSettings} />
                  </div>
                </div>
                {permissions.canEditOrgSettings && (
                  <Button type="button">Sauvegarder</Button>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-6 space-y-6">
          <Card className="rounded-2xl card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Stripe Connect</CardTitle>
              <CardDescription>Votre compte de paiement pour recevoir les rétrocessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium">Compte connecté</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    acct_1234567890 · Vérifié le 01/12/2025
                  </p>
                </div>
                {permissions.canEditBillingSettings && (
                  <Button variant="outline" size="sm">Mettre à jour</Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Informations de paiement</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">IBAN</dt>
                  <dd className="font-mono">FR76 •••• •••• •••• •••• •••• 1234</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Taux de rétrocession</dt>
                  <dd className="font-medium text-primary">70%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Fréquence de paiement</dt>
                  <dd>Mensuelle</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {permissions.canManageTeam && (
          <TabsContent value="team" className="mt-6">
            <Card className="rounded-2xl card-elevated">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Membres de l'équipe</CardTitle>
                    <CardDescription>{MOCK_TEAM.length} membres</CardDescription>
                  </div>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Inviter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Membre</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_TEAM.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{member.name}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ROLE_COLORS[member.role]}>
                            <Shield className="mr-1 h-3 w-3" />
                            {ROLE_LABELS[member.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {member.role !== 'OWNER' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
