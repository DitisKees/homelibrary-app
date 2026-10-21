import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthModel } from 'pocketbase';
import { AppState } from 'react-native';
import { clearPocketBaseSession, hydrateAuthStore, initializePocketBase, pb, validateServerSession } from '@/lib/pocketbase';
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
        if (pb.authStore.isValid) {
          try {
            await validateServerSession();
          } catch {
            // Keep the locally valid session while a backend is unavailable.
            // This is common when a free-tier backend wakes from sleep.
          }
        }
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
    let previousUserId = pb.authStore.model?.id ?? null;
    return pb.authStore.onChange(() => {
      const nextUserId = pb.authStore.model?.id ?? null;
      if (previousUserId && nextUserId !== previousUserId) {
        queryClient.clear();
      }
      previousUserId = nextUserId;
      setUser(pb.authStore.model);
    }, true);
  }, [endpoint, queryClient]);

  // A demo may restart while the app is in the background. Verify the existing
  // session when the app returns, without mistaking cold-start/network errors
  // for revoked credentials.
  useEffect(() => {
    if (!endpoint || !user?.id) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void validateServerSession().catch(() => {});
        void queryClient.invalidateQueries({ queryKey: ['books', 'list'] });
      }
    });
    return () => subscription.remove();
  }, [endpoint, user?.id, queryClient]);

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
