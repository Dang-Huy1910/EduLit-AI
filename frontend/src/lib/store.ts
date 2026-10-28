'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from './types';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

interface AppState {
  // Session — identity source of truth is GET /api/auth/me via auth-store.
  currentUser: User | null;
  setUser: (user: User) => void;
  clearAuthUser: () => void;

  // Sidebar Layout
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Toasts
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
}

type PersistedAppState = Pick<AppState, 'sidebarCollapsed'>;

function persistedSidebarState(state: unknown): PersistedAppState {
  return {
    sidebarCollapsed:
      state !== null &&
      typeof state === 'object' &&
      'sidebarCollapsed' in state &&
      typeof state.sidebarCollapsed === 'boolean'
        ? state.sidebarCollapsed
        : false,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Session
      currentUser: null,
      setUser: (user: User) => set({ currentUser: user }),
      clearAuthUser: () => set({ currentUser: null }),

      // Sidebar Layout
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Toasts
      toasts: [],
      addToast: (message: string, type: ToastMessage['type'] = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
        setTimeout(() => {
          get().removeToast(id);
        }, 3500);
      },
      removeToast: (id: string) => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      },
    }),
    {
      name: 'edulit-app-v2',
      // Version 0 persisted prototype data. Only the sidebar preference survives.
      version: 1,
      migrate: (state) => persistedSidebarState(state),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedSidebarState(persistedState),
      }),
      storage: createJSONStorage(() => ({
        getItem: (key: string) => {
          if (typeof window === 'undefined') return null;
          try {
            return sessionStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (key: string, value: string) => {
          if (typeof window === 'undefined') return;
          try {
            sessionStorage.setItem(key, value);
          } catch (err) {
            console.warn('[EduLit] sessionStorage quota exceeded, keeping state in RAM:', err);
          }
        },
        removeItem: (key: string) => {
          if (typeof window === 'undefined') return;
          try {
            sessionStorage.removeItem(key);
          } catch {}
        },
      })),
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);
