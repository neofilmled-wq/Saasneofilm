'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole: string | null;
  orgId?: string;
  orgName?: string;
  orgRole?: string;
  onboardingCompleted?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  setTokensFromCallback: (accessToken: string, refreshToken: string, isNew: boolean) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

async function fetchUserInfo(accessToken: string): Promise<{ orgId?: string; orgName?: string; orgRole?: string; onboardingCompleted?: boolean }> {
  let orgId, orgName, orgRole;
  let onboardingCompleted = false;
  const meRes = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (meRes.ok) {
    const meJson = await meRes.json();
    const meData = meJson.data ?? meJson;
    if (meData?.memberships?.[0]) {
      const m = meData.memberships[0];
      orgId = m.organization?.id || m.organizationId;
      orgName = m.organization?.name;
      orgRole = m.role;
    }
  }
  // Check onboarding status
  const onbRes = await fetch(`${API_URL}/onboarding/status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (onbRes.ok) {
    const onbJson = await onbRes.json();
    const onbData = onbJson.data ?? onbJson;
    onboardingCompleted = !!onbData?.completed;
  }
  return { orgId, orgName, orgRole, onboardingCompleted };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('neofilm_partner_token') : null;
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('neofilm_partner_user') : null;
    if (stored && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(stored);
      } catch {
        localStorage.removeItem('neofilm_partner_token');
        localStorage.removeItem('neofilm_partner_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Login failed');
    }
    const json = await res.json();
    const data = json.data ?? json;

    const info = await fetchUserInfo(data.accessToken);
    const authUser: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      platformRole: data.user.platformRole,
      ...info,
    };
    setUser(authUser);
    setToken(data.accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neofilm_partner_token', data.accessToken);
      localStorage.setItem('neofilm_partner_user', JSON.stringify(authUser));
      localStorage.setItem('neofilm_partner_refresh', data.refreshToken);
    }
  }, []);

  const signup = useCallback(async (data: { email: string; password: string; firstName: string; lastName: string }) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, interfaceType: 'PARTNER' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Registration failed');
    }
    const json = await res.json();
    const resData = json.data ?? json;

    const authUser: AuthUser = {
      id: resData.user.id,
      email: resData.user.email,
      firstName: resData.user.firstName,
      lastName: resData.user.lastName,
      platformRole: resData.user.platformRole,
      onboardingCompleted: false,
    };
    setUser(authUser);
    setToken(resData.accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neofilm_partner_token', resData.accessToken);
      localStorage.setItem('neofilm_partner_user', JSON.stringify(authUser));
      localStorage.setItem('neofilm_partner_refresh', resData.refreshToken);
    }
  }, []);

  const setTokensFromCallback = useCallback(async (accessToken: string, refreshToken: string, _isNew: boolean) => {
    // Decode JWT to get user info
    const payloadBase64 = accessToken.split('.')[1];
    const payload = JSON.parse(atob(payloadBase64));

    const info = await fetchUserInfo(accessToken);
    const authUser: AuthUser = {
      id: payload.sub,
      email: payload.email,
      firstName: '',
      lastName: '',
      platformRole: payload.platformRole,
      ...info,
    };

    // Fetch full profile
    const profileRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profileJson = await profileRes.json();
      const profileData = profileJson.data ?? profileJson;
      authUser.firstName = profileData.firstName || '';
      authUser.lastName = profileData.lastName || '';
    }

    setUser(authUser);
    setToken(accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neofilm_partner_token', accessToken);
      localStorage.setItem('neofilm_partner_user', JSON.stringify(authUser));
      localStorage.setItem('neofilm_partner_refresh', refreshToken);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('neofilm_partner_token');
      localStorage.removeItem('neofilm_partner_user');
      localStorage.removeItem('neofilm_partner_refresh');
    }
  }, []);

  const getToken = useCallback(async () => token, [token]);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated: !!user && !!token, login, signup, setTokensFromCallback, logout, getToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
