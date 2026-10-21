'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ClassContextState {
  userId: string;
  termId: string;
  classroomId: string;
  setUserId: (id: string) => void;
  setTerm: (id: string) => void;
  setClassroom: (id: string) => void;
  select: (termId: string, classroomId: string) => void;
  reset: () => void;
}

export const useClassContext = create<ClassContextState>()(
  persist(
    (set) => ({
      userId: '',
      termId: '',
      classroomId: '',
      setUserId: (userId) => set({ userId }),
      setTerm: (termId) => set({ termId, classroomId: '' }),
      setClassroom: (classroomId) => set({ classroomId }),
      select: (termId, classroomId) => set({ termId, classroomId }),
      reset: () => set({ userId: '', termId: '', classroomId: '' }),
    }),
    {
      name: 'edulit.class-context',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
