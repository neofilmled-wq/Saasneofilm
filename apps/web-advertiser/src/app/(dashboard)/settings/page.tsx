'use client';

import { useState } from 'react';
import { Building2, Users, Shield, Trash2, UserPlus } from 'lucide-react';
import { Button, Card, CardContent, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, Badge } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { useAuth } from '@/providers/auth-provider';

const TEAM_MEMBERS = [
  { id: '1', name: 'Marie Dupont', email: 'marie@boulangerie-dupont.fr', role: 'OWNER', status: 'active' },
  { id: '2', name: 'Jean Martin', email: 'jean@boulangerie-dupont.fr', role: 'MARKETER', status: 'active' },
  { id: '3', name: 'Sophie Bernard', email: 'sophie@boulangerie-dupont.fr', role: 'VIEWER', status: 'pending' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('VIEWER');

  function handleSaveOrg() {
    toast.success('Paramètres sauvegardés');
  }

  function handleInvite() {
    if (!inviteEmail) return;
    toast.success(`Invitation envoyée à ${inviteEmail}`);
    setInviteEmail('');
  }

  return (
    <>
      <PageHeader title="Paramètres" description="Gérez votre organisation et votre équipe" />

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Organisation
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-4 w-4" /> Équipe
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Shield className="h-4 w-4" /> Sécurité
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="mt-4">
          <Card>
            <CardContent className="space-y-6 p-6">
              <h3 className="font-semibold">Informations de l'organisation</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom de l'entreprise</Label>
                  <Input defaultValue={user?.orgName ?? ''} />
                </div>
                <div className="space-y-2">
                  <Label>Email de contact</Label>
                  <Input type="email" defaultValue={user?.email ?? ''} />
                </div>
                <div className="space-y-2">
                  <Label>Adresse</Label>
                  <Input placeholder="12 rue de la Paix" />
                </div>
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input placeholder="Paris" />
                </div>
                <div className="space-y-2">
                  <Label>Code postal</Label>
                  <Input placeholder="75001" />
                </div>
                <div className="space-y-2">
                  <Label>N° SIRET</Label>
                  <Input placeholder="123 456 789 00001" />
                </div>
                <div className="space-y-2">
                  <Label>N° TVA</Label>
                  <Input placeholder="FR12345678901" />
                </div>
                <div className="space-y-2">
                  <Label>Catégorie d'activité</Label>
                  <Select defaultValue="restaurant">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restaurant">Restaurant / Café</SelectItem>
                      <SelectItem value="retail">Commerce / Boutique</SelectItem>
                      <SelectItem value="beauty">Beauté / Bien-être</SelectItem>
                      <SelectItem value="hotel">Hôtellerie</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleSaveOrg}>Enregistrer</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-4 space-y-4">
          {/* Invite member */}
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 font-semibold">Inviter un membre</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="email@exemple.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETER">Marketing</SelectItem>
                    <SelectItem value="VIEWER">Lecture seule</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="gap-1.5" onClick={handleInvite}>
                  <UserPlus className="h-4 w-4" /> Inviter
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Team list */}
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 font-semibold">Membres de l'équipe</h3>
              <div className="space-y-3">
                {TEAM_MEMBERS.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {member.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.role === 'OWNER' ? 'default' : 'outline'}>
                        {member.role === 'OWNER' ? 'Propriétaire' : member.role === 'MARKETER' ? 'Marketing' : 'Lecture'}
                      </Badge>
                      {member.status === 'pending' && (
                        <Badge variant="secondary">En attente</Badge>
                      )}
                      {member.role !== 'OWNER' && (
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardContent className="space-y-6 p-6">
              <h3 className="font-semibold">Sécurité du compte</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Mot de passe</p>
                    <p className="text-sm text-muted-foreground">Dernière modification il y a 30 jours</p>
                  </div>
                  <Button variant="outline" size="sm">Changer</Button>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Authentification à deux facteurs (2FA)</p>
                    <p className="text-sm text-muted-foreground">Renforcez la sécurité de votre compte</p>
                  </div>
                  <Button variant="outline" size="sm">Activer</Button>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Sessions actives</p>
                    <p className="text-sm text-muted-foreground">1 session active sur cet appareil</p>
                  </div>
                  <Button variant="outline" size="sm">Voir</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
