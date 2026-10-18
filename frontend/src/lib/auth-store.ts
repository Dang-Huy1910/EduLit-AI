'use client';

import { create } from 'zustand';
import { AuthApiError, AuthStatus, PublicUser } from './auth-types';
import { authClient } from './auth-client';
import { mapPublicUser } from './auth-user';
import { useAppStore } from './store';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  errorMessage: string | null;
  initialize: () => Promise<void>;
  setAuthenticated: (user: PublicUser) => void;
  clear: () => void;
  logout: () => Promise<void>;
}

function syncAppUser(user: PublicUser | null): void {
  if (user) {
    useAppStore.getState().setUser(mapPublicUser(user));
  } else {
    useAppStore.getState().clearAuthUser();
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'initializing',
  user: null,
  errorMessage: null,
  initialize: async () => {
    set({ status: 'initializing', errorMessage: null });
    try {
      const user = await authClient.me();
      syncAppUser(user);
      set({ status: 'authenticated', user, errorMessage: null });
    } catch (err) {
      if (err instanceof AuthApiError && (err.status === 401 || err.code === 'AUTH_INVALID')) {
        syncAppUser(null);
        set({ status: 'unauthenticated', user: null, errorMessage: null });
        return;
      }
      const message =
        err instanceof AuthApiError
          ? err.message
          : 'Không kết nối được máy chủ xác thực.';
      set({ status: 'error', user: null, errorMessage: message });
    }
  },
  setAuthenticated: (user: PublicUser) => {
    syncAppUser(user);
    set({ status: 'authenticated', user, errorMessage: null });
  },
  clear: () => {
    syncAppUser(null);
    set({ status: 'unauthenticated', user: null, errorMessage: null });
  },
  logout: async () => {
    try {
      await authClient.logout();
    } catch (err) {
      if (err instanceof AuthApiError && err.code === 'NETWORK') {
        throw err;
      }
    }
    get().clear();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('edulit-app-v1');
      } catch {
        /* ignore */
      }
    }
  },
}));
