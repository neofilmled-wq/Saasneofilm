'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';
  avatar?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('neofilm_admin_token') : null;
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('neofilm_admin_user') : null;
    if (stored && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(stored);
      } catch {
        localStorage.removeItem('neofilm_admin_token');
        localStorage.removeItem('neofilm_admin_user');
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
    const authUser: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      role: data.user.platformRole || 'ADMIN',
    };
    setUser(authUser);
    setToken(data.accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neofilm_admin_token', data.accessToken);
      localStorage.setItem('neofilm_admin_user', JSON.stringify(authUser));
      localStorage.setItem('neofilm_admin_refresh', data.refreshToken);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('neofilm_admin_token');
      localStorage.removeItem('neofilm_admin_user');
      localStorage.removeItem('neofilm_admin_refresh');
    }
  }, []);

  const getToken = useCallback(async () => token, [token]);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated: !!user && !!token, login, logout, getToken }}
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
