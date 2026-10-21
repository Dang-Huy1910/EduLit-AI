'use client';

import { create } from 'zustand';
import { AuthApiError, AuthStatus, PublicUser } from './auth-types';
import { authClient } from './auth-client';
import { mapPublicUser } from './auth-user';
import { useAppStore } from './store';
import { useClassContext } from '@/features/classrooms/class-context';
import { useClassDataStore, useStudentClassDataStore } from '@/features/classrooms/class-data-store';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  errorMessage: string | null;
  initialize: () => Promise<void>;
  setAuthenticated: (user: PublicUser) => void;
  clear: () => void;
  logout: () => Promise<void>;
}

// A completed login, registration, or logout supersedes any pending session check.
let initializationGeneration = 0;

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
    const generation = ++initializationGeneration;
    set({ status: 'initializing', errorMessage: null });
    try {
      const user = await authClient.me();
      if (generation !== initializationGeneration) return;
      syncAppUser(user);
      set({ status: 'authenticated', user, errorMessage: null });
    } catch (err) {
      if (generation !== initializationGeneration) return;
      const isUnauthorized =
        (err instanceof AuthApiError && (err.status === 401 || err.code === 'AUTH_INVALID')) ||
        (typeof err === 'object' && err !== null && (('status' in err && (err as { status?: number }).status === 401) || ('code' in err && (err as { code?: string }).code === 'AUTH_INVALID')));

      if (isUnauthorized) {
        syncAppUser(null);
        set({ status: 'unauthenticated', user: null, errorMessage: null });
        return;
      }
      const message =
        err instanceof AuthApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Không kết nối được máy chủ xác thực.';
      set({ status: 'error', user: null, errorMessage: message });
    }
  },
  setAuthenticated: (user: PublicUser) => {
    initializationGeneration += 1;
    syncAppUser(user);
    set({ status: 'authenticated', user, errorMessage: null });
  },
  clear: () => {
    initializationGeneration += 1;
    syncAppUser(null);
    set({ status: 'unauthenticated', user: null, errorMessage: null });
  },
  logout: async () => {
    initializationGeneration += 1;
    useClassDataStore.getState().reset();
    useStudentClassDataStore.getState().reset();
    useClassContext.getState().reset();
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
