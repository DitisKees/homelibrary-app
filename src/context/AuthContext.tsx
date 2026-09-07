import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthModel } from 'pocketbase';
import { clearPocketBaseSession, hydrateAuthStore, initializePocketBase, pb } from '@/lib/pocketbase';
import {
  clearRuntimePocketBaseEndpoint,
  getConfiguredPocketBaseEndpoint,
  getDeploymentPocketBaseEndpoint,
  setRuntimePocketBaseEndpoint,
} from '@/services/settings/pocketbase';

type AuthContextValue = {
  user: AuthModel;
  endpoint: string | undefined;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  changeEndpoint: (endpoint: string) => Promise<void>;
  resetEndpoint: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthModel>(null);
  const [endpoint, setEndpoint] = useState<string | undefined>();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const configuredEndpoint = await getConfiguredPocketBaseEndpoint();
      if (configuredEndpoint) {
        initializePocketBase(configuredEndpoint);
        await hydrateAuthStore();
        if (!active) return;
        setEndpoint(configuredEndpoint);
        setUser(pb.authStore.model);
      }
      if (active) setIsReady(true);
    })().catch(() => {
      if (active) setIsReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!endpoint) return;
    return pb.authStore.onChange(() => setUser(pb.authStore.model), true);
  }, [endpoint]);

  async function login(email: string, password: string) {
    await pb.collection('users').authWithPassword(email, password);
  }

  function logout() {
    void clearPocketBaseSession();
  }

  async function changeEndpoint(value: string) {
    const nextEndpoint = await setRuntimePocketBaseEndpoint(value);
    await clearPocketBaseSession();
    queryClient.clear();
    initializePocketBase(nextEndpoint);
    setUser(null);
    setEndpoint(nextEndpoint);
  }

  async function resetEndpoint() {
    await clearRuntimePocketBaseEndpoint();
    await clearPocketBaseSession();
    queryClient.clear();
    const defaultEndpoint = getDeploymentPocketBaseEndpoint();
    if (defaultEndpoint) initializePocketBase(defaultEndpoint);
    setUser(null);
    setEndpoint(defaultEndpoint);
  }

  return (
    <AuthContext.Provider value={{ user, endpoint, isReady, login, logout, changeEndpoint, resetEndpoint }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
