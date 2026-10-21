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
}

const termsGate = createRequestGate<void>();
const classroomGates = new Map<string, ReturnType<typeof createRequestGate<void>>>();

function classroomGate(termId: string) {
  let gate = classroomGates.get(termId);
  if (!gate) {
    gate = createRequestGate<void>();
    classroomGates.set(termId, gate);
  }
  return gate;
}

export const useClassDataStore = create<ClassDataState>()((set, get) => ({
  terms: [],
  classrooms: [],
  termsLoaded: false,
  classroomsLoadedForTermId: '',
  requestedTermId: '',
  termsLoading: false,
  classroomsLoading: false,
  error: '',
  loadTerms: (force = false) => {
    if (!force && get().termsLoaded) return Promise.resolve();
    return termsGate.run(async () => {
      set({ termsLoading: true, error: '' });
      try {
        const { items } = await classroomsApi.listTerms();
        set({ terms: items, termsLoaded: true });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Không tải được danh sách kỳ học.' });
      } finally {
        set({ termsLoading: false });
      }
    });
  },
  loadClassrooms: (termId, force = false) => {
    if (!termId) {
      set({ classrooms: [], classroomsLoadedForTermId: '', requestedTermId: '', classroomsLoading: false });
      return Promise.resolve();
    }
    if (!force && get().classroomsLoadedForTermId === termId) return Promise.resolve();
    if (get().requestedTermId !== termId) {
      set({
        classrooms: [],
        classroomsLoadedForTermId: '',
        requestedTermId: termId,
        classroomsLoading: true,
        error: '',
      });
    }
    return classroomGate(termId).run(async () => {
      set({ classroomsLoading: true, error: '' });
      try {
        const { items } = await classroomsApi.listTeacherClassrooms({ termId });
        if (get().requestedTermId === termId) {
          set({
            classrooms: items.filter((item) => !item.archived),
            classroomsLoadedForTermId: termId,
          });
        }
      } catch (err) {
        if (get().requestedTermId === termId) {
          set({
            classrooms: [],
            classroomsLoadedForTermId: '',
            error: err instanceof Error ? err.message : 'Không tải được danh sách lớp.',
          });
        }
      } finally {
        if (get().requestedTermId === termId) set({ classroomsLoading: false });
      }
    });
  },
}));
