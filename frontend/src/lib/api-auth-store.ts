'use client';

import { create } from 'zustand';
import { demoLoginApi, fetchMe, loginApi, logoutApi } from './api/auth';
import { setApiAuthBridge } from './api/http';
import { ApiError, type ApiUser } from './api/types';
import { isApiMode } from './data-mode';
import { clearSocraticLocalState } from './socratic-draft';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

type ApiAuthState = {
  status: AuthStatus;
  user: ApiUser | null;
  generation: number;
  bootstrap: () => Promise<void>;
  login: (loginId: string, password: string) => Promise<ApiUser>;
  demoLogin: (loginId: string) => Promise<ApiUser>;
  logout: () => Promise<void>;
  markUnauthorized: () => void;
};

export const useApiAuthStore = create<ApiAuthState>((set, get) => ({
  status: 'idle',
  user: null,
  generation: 0,
  bootstrap: async () => {
    if (!isApiMode()) {
      set({ status: 'unauthenticated', user: null });
      return;
    }
    if (get().status === 'loading' || get().status === 'authenticated') {
      return;
    }
    set({ status: 'loading' });
    try {
      const user = await fetchMe();
      set({ status: 'authenticated', user });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        set({ status: 'unauthenticated', user: null });
        return;
      }
      set({ status: 'unauthenticated', user: null });
    }
  },
  login: async (loginId, password) => {
    const user = await loginApi(loginId, password);
    set((state) => ({
      status: 'authenticated',
      user,
      generation: state.generation + 1,
    }));
    return user;
  },
  demoLogin: async (loginId) => {
    const user = await demoLoginApi(loginId);
    set((state) => ({
      status: 'authenticated',
      user,
      generation: state.generation + 1,
    }));
    return user;
  },
  logout: async () => {
    const userId = get().user?.id;
    try {
      await logoutApi();
    } catch {
      // Cookie/session is cleared locally even if the network call fails.
    }
    clearSocraticLocalState(userId);
    set((state) => ({
      status: 'unauthenticated',
      user: null,
      generation: state.generation + 1,
    }));
  },
  markUnauthorized: () => {
    const current = get();
    if (current.status === 'unauthenticated' && !current.user) {
      return;
    }
    clearSocraticLocalState(current.user?.id);
    set({
      status: 'unauthenticated',
      user: null,
      generation: current.generation + 1,
    });
  },
}));

setApiAuthBridge({
  generation: () => useApiAuthStore.getState().generation,
  onUnauthorized: () => useApiAuthStore.getState().markUnauthorized(),
});

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}
