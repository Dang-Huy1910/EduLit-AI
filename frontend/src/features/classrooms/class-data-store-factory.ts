'use client';

import { create } from 'zustand';
import type { Term } from '@/features/catalog/types';
import { createRequestGate } from './request-gate';

interface ClassDataState<T> {
  terms: Term[];
  classrooms: T[];
  termsLoaded: boolean;
  classroomsLoadedForTermId: string;
  requestedTermId: string;
  termsLoading: boolean;
  classroomsLoading: boolean;
  error: string;
  loadTerms: (force?: boolean) => Promise<void>;
  loadClassrooms: (termId: string, force?: boolean) => Promise<void>;
  invalidateClassrooms: () => void;
  reset: () => void;
}

interface CreateClassDataStoreOptions<T> {
  filter?: (classroom: T) => boolean;
  fetchTerms?: () => Promise<{ items: Term[] }>;
}

function initialData<T>() {
  return {
    terms: [] as Term[],
    classrooms: [] as T[],
    termsLoaded: false,
    classroomsLoadedForTermId: '',
    requestedTermId: '',
    termsLoading: false,
    classroomsLoading: false,
    error: '',
  };
}

export function createClassDataStore<T>(
  fetchClassrooms: (termId: string) => Promise<{ items: T[] }>,
  { filter, fetchTerms = async () => ({ items: [] }) }: CreateClassDataStoreOptions<T> = {}
) {
  let termsGate = createRequestGate<void>();
  const classroomGates = new Map<string, ReturnType<typeof createRequestGate<void>>>();
  let requestGeneration = 0;

  const resetRequestGates = () => {
    requestGeneration += 1;
    termsGate = createRequestGate<void>();
    classroomGates.clear();
  };

  const classroomGate = (termId: string) => {
    let gate = classroomGates.get(termId);
    if (!gate) {
      gate = createRequestGate<void>();
      classroomGates.set(termId, gate);
    }
    return gate;
  };

  return create<ClassDataState<T>>()((set, get) => ({
    ...initialData<T>(),
    loadTerms: (force = false) => {
      if (!force && get().termsLoaded) return Promise.resolve();
      const generation = requestGeneration;
      return termsGate.run(async () => {
        set({ termsLoading: true, error: '' });
        try {
          const { items } = await fetchTerms();
          if (generation === requestGeneration) set({ terms: items, termsLoaded: true });
        } catch (err) {
          if (generation === requestGeneration) {
            set({ error: err instanceof Error ? err.message : 'Không tải được danh sách kỳ học.' });
          }
        } finally {
          if (generation === requestGeneration) set({ termsLoading: false });
        }
      });
    },
    loadClassrooms: (termId, force = false) => {
      if (!termId) {
        set({ classrooms: [], classroomsLoadedForTermId: '', requestedTermId: '', classroomsLoading: false });
        return Promise.resolve();
      }
      if (!force && get().classroomsLoadedForTermId === termId) return Promise.resolve();
      const generation = requestGeneration;
      if (get().requestedTermId !== termId) {
        set({
          classrooms: [],
          classroomsLoadedForTermId: '',
          requestedTermId: termId,
          classroomsLoading: true,
          error: '',
        });
      } else if (force) {
        set({ classroomsLoadedForTermId: '', classroomsLoading: true, error: '' });
      }
      return classroomGate(termId).run(async () => {
        set({ classroomsLoading: true, error: '' });
        try {
          const { items } = await fetchClassrooms(termId);
          if (generation === requestGeneration && get().requestedTermId === termId) {
            set({
              classrooms: filter ? items.filter(filter) : items,
              classroomsLoadedForTermId: termId,
            });
          }
        } catch (err) {
          if (generation === requestGeneration && get().requestedTermId === termId) {
            set({
              classrooms: [],
              classroomsLoadedForTermId: '',
              error: err instanceof Error ? err.message : 'Không tải được danh sách lớp.',
            });
          }
        } finally {
          if (generation === requestGeneration && get().requestedTermId === termId) set({ classroomsLoading: false });
        }
      });
    },
    invalidateClassrooms: () => set({ classroomsLoadedForTermId: '' }),
    reset: () => {
      resetRequestGates();
      set(initialData<T>());
    },
  }));
}
