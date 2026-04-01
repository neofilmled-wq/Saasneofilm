'use client';

import { usePartnerOrg } from './use-partner-org';

type OrgRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';

interface OrgPermissions {
  role: OrgRole;
  canCreateScreens: boolean;
  canEditScreens: boolean;
  canDeleteScreens: boolean;
  canPairDevices: boolean;
  canRevokeDevices: boolean;
  canSendCommands: boolean;
  canEditUxSettings: boolean;
  canViewRevenue: boolean;
  canExportRevenue: boolean;
  canManageTeam: boolean;
  canEditOrgSettings: boolean;
  canEditBillingSettings: boolean;
  canManageSites: boolean;
  canManageAlerts: boolean;
}

const PERMISSION_MATRIX: Record<OrgRole, Omit<OrgPermissions, 'role'>> = {
  OWNER: {
    canCreateScreens: true,
    canEditScreens: true,
    canDeleteScreens: true,
    canPairDevices: true,
    canRevokeDevices: true,
    canSendCommands: true,
    canEditUxSettings: true,
    canViewRevenue: true,
    canExportRevenue: true,
    canManageTeam: true,
    canEditOrgSettings: true,
    canEditBillingSettings: true,
    canManageSites: true,
    canManageAlerts: true,
  },
  ADMIN: {
    canCreateScreens: true,
    canEditScreens: true,
    canDeleteScreens: true,
    canPairDevices: true,
    canRevokeDevices: true,
    canSendCommands: true,
    canEditUxSettings: true,
    canViewRevenue: true,
    canExportRevenue: true,
    canManageTeam: true,
    canEditOrgSettings: true,
    canEditBillingSettings: false,
    canManageSites: true,
    canManageAlerts: true,
  },
  MANAGER: {
    canCreateScreens: true,
    canEditScreens: true,
    canDeleteScreens: false,
    canPairDevices: true,
    canRevokeDevices: true,
    canSendCommands: true,
    canEditUxSettings: true,
    canViewRevenue: true,
    canExportRevenue: false,
    canManageTeam: false,
    canEditOrgSettings: false,
    canEditBillingSettings: false,
    canManageSites: true,
    canManageAlerts: true,
  },
  MEMBER: {
    canCreateScreens: false,
    canEditScreens: false,
    canDeleteScreens: false,
    canPairDevices: false,
    canRevokeDevices: false,
    canSendCommands: true,
    canEditUxSettings: false,
    canViewRevenue: false,
    canExportRevenue: false,
    canManageTeam: false,
    canEditOrgSettings: false,
    canEditBillingSettings: false,
    canManageSites: false,
    canManageAlerts: true,
  },
  VIEWER: {
    canCreateScreens: false,
    canEditScreens: false,
    canDeleteScreens: false,
    canPairDevices: false,
    canRevokeDevices: false,
    canSendCommands: false,
    canEditUxSettings: false,
    canViewRevenue: false,
    canExportRevenue: false,
    canManageTeam: false,
    canEditOrgSettings: false,
    canEditBillingSettings: false,
    canManageSites: false,
    canManageAlerts: false,
  },
};

export function useOrgPermissions(): OrgPermissions {
  const { orgRole } = usePartnerOrg();
  const role = (orgRole as OrgRole) ?? 'VIEWER';

  return {
    role,
    ...PERMISSION_MATRIX[role],
  };
}
