'use client';

import { useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import type { ClassroomSummary, StudentClassroom, Term } from '@/features/catalog/types';
import { useClassContext } from './class-context';
import { useClassDataStore, useStudentClassDataStore } from './class-data-store';
import { pickDefaultClassroom, pickDefaultTerm, shouldResetClassContext } from './model';

type ContextRole = 'teacher' | 'student';
type ClassroomForRole = ClassroomSummary | StudentClassroom;

interface ClassContextValue<T extends ClassroomForRole> {
  terms: Term[];
  term: Term | undefined;
  classrooms: T[];
  classroom: T | undefined;
  loading: boolean;
  error: string;
  setTerm: (id: string) => void;
  setClassroom: (id: string) => void;
  select: (termId: string, classroomId: string) => void;
  reload: () => Promise<void>;
}

function useClassContextForRole(role: ContextRole): ClassContextValue<ClassroomForRole> {
  const currentUserId = useAppStore((state) => state.currentUser?.id);
  const storedUserId = useClassContext((state) => state.userId);
  const termId = useClassContext((state) => state.termId);
  const classroomId = useClassContext((state) => state.classroomId);
  const setStoredUserId = useClassContext((state) => state.setUserId);
  const setStoredTerm = useClassContext((state) => state.setTerm);
  const setStoredClassroom = useClassContext((state) => state.setClassroom);
  const select = useClassContext((state) => state.select);
  const resetContext = useClassContext((state) => state.reset);

  const teacherTerms = useClassDataStore((state) => state.terms);
  const teacherClassrooms = useClassDataStore((state) => state.classrooms);
  const teacherTermsLoaded = useClassDataStore((state) => state.termsLoaded);
  const teacherClassroomsLoadedForTermId = useClassDataStore((state) => state.classroomsLoadedForTermId);
  const teacherTermsLoading = useClassDataStore((state) => state.termsLoading);
  const teacherClassroomsLoading = useClassDataStore((state) => state.classroomsLoading);
  const teacherError = useClassDataStore((state) => state.error);
  const loadTeacherTerms = useClassDataStore((state) => state.loadTerms);
  const loadTeacherClassrooms = useClassDataStore((state) => state.loadClassrooms);
  const invalidateTeacherClassrooms = useClassDataStore((state) => state.invalidateClassrooms);
  const resetTeacherData = useClassDataStore((state) => state.reset);

  const studentTerms = useStudentClassDataStore((state) => state.terms);
  const studentClassrooms = useStudentClassDataStore((state) => state.classrooms);
  const studentTermsLoaded = useStudentClassDataStore((state) => state.termsLoaded);
  const studentClassroomsLoadedForTermId = useStudentClassDataStore((state) => state.classroomsLoadedForTermId);
  const studentTermsLoading = useStudentClassDataStore((state) => state.termsLoading);
  const studentClassroomsLoading = useStudentClassDataStore((state) => state.classroomsLoading);
  const studentError = useStudentClassDataStore((state) => state.error);
  const loadStudentTerms = useStudentClassDataStore((state) => state.loadTerms);
  const loadStudentClassrooms = useStudentClassDataStore((state) => state.loadClassrooms);
  const invalidateStudentClassrooms = useStudentClassDataStore((state) => state.invalidateClassrooms);
  const resetStudentData = useStudentClassDataStore((state) => state.reset);

  const isStudent = role === 'student';
  const terms = isStudent ? studentTerms : teacherTerms;
  const classrooms = isStudent ? studentClassrooms : teacherClassrooms;
  const termsLoaded = isStudent ? studentTermsLoaded : teacherTermsLoaded;
  const classroomsLoadedForTermId = isStudent
    ? studentClassroomsLoadedForTermId
    : teacherClassroomsLoadedForTermId;
  const termsLoading = isStudent ? studentTermsLoading : teacherTermsLoading;
  const classroomsLoading = isStudent ? studentClassroomsLoading : teacherClassroomsLoading;
  const error = isStudent ? studentError : teacherError;
  const userContextReady = !shouldResetClassContext(storedUserId, currentUserId);

  useEffect(() => {
    if (!shouldResetClassContext(storedUserId, currentUserId)) return;
    resetTeacherData();
    resetStudentData();
    resetContext();
    if (currentUserId) setStoredUserId(currentUserId);
  }, [storedUserId, currentUserId, resetTeacherData, resetStudentData, resetContext, setStoredUserId]);

  useEffect(() => {
    if (!currentUserId || !userContextReady) return;
    if (isStudent) void loadStudentTerms();
    else void loadTeacherTerms();
  }, [currentUserId, isStudent, userContextReady, loadStudentTerms, loadTeacherTerms]);

  useEffect(() => {
    if (!currentUserId || !userContextReady || !termsLoaded) return;
    const selected = terms.find((item) => item.id === termId) || pickDefaultTerm(terms);
    if (selected && selected.id !== termId) setStoredTerm(selected.id);
  }, [currentUserId, userContextReady, termsLoaded, terms, termId, setStoredTerm]);

  useEffect(() => {
    if (!currentUserId || !userContextReady || !termsLoaded || !termId) return;
    if (isStudent) void loadStudentClassrooms(termId);
    else void loadTeacherClassrooms(termId);
  }, [currentUserId, isStudent, userContextReady, termsLoaded, termId, loadStudentClassrooms, loadTeacherClassrooms]);

  useEffect(() => {
    if (!currentUserId || !userContextReady || classroomsLoading || classroomsLoadedForTermId !== termId) return;
    if (isStudent) {
      if (classroomId && !classrooms.some((item) => item.id === classroomId)) setStoredClassroom('');
      return;
    }
    const selected = pickDefaultClassroom(classrooms as ClassroomSummary[], classroomId);
    if (selected && selected.id !== classroomId) setStoredClassroom(selected.id);
    if (!selected && classroomId) setStoredClassroom('');
  }, [currentUserId, isStudent, userContextReady, classroomsLoading, classroomsLoadedForTermId, termId, classrooms, classroomId, setStoredClassroom]);

  const reload = useCallback(async () => {
    if (!currentUserId || !userContextReady) return;
    if (isStudent) {
      invalidateStudentClassrooms();
      await loadStudentTerms(true);
      const latestTerms = useStudentClassDataStore.getState().terms;
      const storedTermId = useClassContext.getState().termId;
      const selected = latestTerms.find((item) => item.id === storedTermId) || pickDefaultTerm(latestTerms);
      if (!selected) return;
      if (selected.id !== storedTermId) setStoredTerm(selected.id);
      await loadStudentClassrooms(selected.id, true);
      return;
    }
    invalidateTeacherClassrooms();
    await loadTeacherTerms(true);
    const latestTerms = useClassDataStore.getState().terms;
    const storedTermId = useClassContext.getState().termId;
    const selected = latestTerms.find((item) => item.id === storedTermId) || pickDefaultTerm(latestTerms);
    if (!selected) return;
    if (selected.id !== storedTermId) setStoredTerm(selected.id);
    await loadTeacherClassrooms(selected.id, true);
  }, [
    isStudent,
    currentUserId,
    userContextReady,
    loadStudentTerms,
    loadStudentClassrooms,
    invalidateStudentClassrooms,
    loadTeacherTerms,
    loadTeacherClassrooms,
    invalidateTeacherClassrooms,
    setStoredTerm,
  ]);

  const term = terms.find((item) => item.id === termId);
  const classroom = classrooms.find((item) => item.id === classroomId);

  return {
    terms,
    term,
    classrooms,
    classroom,
    loading: termsLoading || classroomsLoading,
    error,
    setTerm: setStoredTerm,
    setClassroom: setStoredClassroom,
    select,
    reload,
  };
}

export function useTeacherClassContext(): ClassContextValue<ClassroomSummary>;
export function useTeacherClassContext(options: { role?: 'teacher' }): ClassContextValue<ClassroomSummary>;
export function useTeacherClassContext(options: { role: 'student' }): ClassContextValue<StudentClassroom>;
export function useTeacherClassContext({ role = 'teacher' }: { role?: ContextRole } = {}) {
  return useClassContextForRole(role) as ClassContextValue<ClassroomSummary> | ClassContextValue<StudentClassroom>;
}

export function useStudentClassContext(): ClassContextValue<StudentClassroom> {
  return useTeacherClassContext({ role: 'student' });
}
