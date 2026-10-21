'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ClassContextState {
  termId: string;
  classroomId: string;
  setTerm: (id: string) => void;
  setClassroom: (id: string) => void;
  select: (termId: string, classroomId: string) => void;
  reset: () => void;
}

export const useClassContext = create<ClassContextState>()(
  persist(
    (set) => ({
      termId: '',
      classroomId: '',
      setTerm: (termId) => set({ termId, classroomId: '' }),
      setClassroom: (classroomId) => set({ classroomId }),
      select: (termId, classroomId) => set({ termId, classroomId }),
      reset: () => set({ termId: '', classroomId: '' }),
    }),
    {
      name: 'edulit.class-context',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
