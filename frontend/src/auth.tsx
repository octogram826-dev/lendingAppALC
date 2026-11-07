import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './lib/api';
import type { AuthUser, One } from './lib/types';

type AuthValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
  can: (...codes: string[]) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const result = await api<One<AuthUser>>('/api/auth/me');
      setUser(result.data);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('alc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('alc:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const result = await api<One<{ token: string; user: AuthUser }>>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(result.data.token, remember);
    setUser(result.data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      login,
      logout,
      refresh,
      can: (...codes) => codes.some((code) => user?.permissions.includes(code)),
    }),
    [user, ready, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
