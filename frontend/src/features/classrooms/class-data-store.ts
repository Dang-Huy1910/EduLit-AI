'use client';

import { create } from 'zustand';
import type { ClassroomSummary, Term } from '@/features/catalog/types';
import { classroomsApi } from './api';
import { createRequestGate } from './request-gate';

interface ClassDataState {
  terms: Term[];
  classrooms: ClassroomSummary[];
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

const INITIAL_DATA = {
  terms: [] as Term[],
  classrooms: [] as ClassroomSummary[],
  termsLoaded: false,
  classroomsLoadedForTermId: '',
  requestedTermId: '',
  termsLoading: false,
  classroomsLoading: false,
  error: '',
};

let termsGate = createRequestGate<void>();
const classroomGates = new Map<string, ReturnType<typeof createRequestGate<void>>>();
let requestGeneration = 0;

function resetRequestGates() {
  requestGeneration += 1;
  termsGate = createRequestGate<void>();
  classroomGates.clear();
}

function classroomGate(termId: string) {
  let gate = classroomGates.get(termId);
  if (!gate) {
    gate = createRequestGate<void>();
    classroomGates.set(termId, gate);
  }
  return gate;
}

export const useClassDataStore = create<ClassDataState>()((set, get) => ({
  ...INITIAL_DATA,
  loadTerms: (force = false) => {
    if (!force && get().termsLoaded) return Promise.resolve();
    const generation = requestGeneration;
    return termsGate.run(async () => {
      set({ termsLoading: true, error: '' });
      try {
        const { items } = await classroomsApi.listTerms();
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
        const { items } = await classroomsApi.listTeacherClassrooms({ termId });
        if (generation === requestGeneration && get().requestedTermId === termId) {
          set({
            classrooms: items.filter((item) => !item.archived),
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
    set(INITIAL_DATA);
  },
}));
