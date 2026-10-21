'use client';

import { useCallback, useEffect } from 'react';
import { useClassContext } from './class-context';
import { useClassDataStore } from './class-data-store';
import { pickDefaultClassroom, pickDefaultTerm } from './model';

export function useTeacherClassContext({ role = 'teacher' }: { role?: 'teacher' | 'student' } = {}) {
  const termId = useClassContext((state) => state.termId);
  const classroomId = useClassContext((state) => state.classroomId);
  const setStoredTerm = useClassContext((state) => state.setTerm);
  const setStoredClassroom = useClassContext((state) => state.setClassroom);
  const select = useClassContext((state) => state.select);
  const terms = useClassDataStore((state) => state.terms);
  const classrooms = useClassDataStore((state) => state.classrooms);
  const termsLoaded = useClassDataStore((state) => state.termsLoaded);
  const classroomsLoadedForTermId = useClassDataStore((state) => state.classroomsLoadedForTermId);
  const termsLoading = useClassDataStore((state) => state.termsLoading);
  const classroomsLoading = useClassDataStore((state) => state.classroomsLoading);
  const error = useClassDataStore((state) => state.error);
  const loadTerms = useClassDataStore((state) => state.loadTerms);
  const loadClassrooms = useClassDataStore((state) => state.loadClassrooms);

  useEffect(() => {
    if (role === 'teacher') void loadTerms();
  }, [role, loadTerms]);

  useEffect(() => {
    if (role !== 'teacher' || !termsLoaded) return;
    const selected = terms.find((item) => item.id === termId) || pickDefaultTerm(terms);
    if (selected && selected.id !== termId) setStoredTerm(selected.id);
  }, [role, termsLoaded, terms, termId, setStoredTerm]);

  useEffect(() => {
    if (role === 'teacher' && termsLoaded && termId) void loadClassrooms(termId);
  }, [role, termsLoaded, termId, loadClassrooms]);

  useEffect(() => {
    if (role !== 'teacher' || classroomsLoading || classroomsLoadedForTermId !== termId) return;
    const selected = pickDefaultClassroom(classrooms, classroomId);
    if (selected && selected.id !== classroomId) setStoredClassroom(selected.id);
    if (!selected && classroomId) setStoredClassroom('');
  }, [role, classroomsLoading, classroomsLoadedForTermId, termId, classrooms, classroomId, setStoredClassroom]);

  const reload = useCallback(async () => {
    if (role !== 'teacher') return;
    await loadTerms(true);
    const latestTerms = useClassDataStore.getState().terms;
    const storedTermId = useClassContext.getState().termId;
    const selected = latestTerms.find((item) => item.id === storedTermId) || pickDefaultTerm(latestTerms);
    if (!selected) return;
    if (selected.id !== storedTermId) setStoredTerm(selected.id);
    await loadClassrooms(selected.id, true);
  }, [role, loadTerms, loadClassrooms, setStoredTerm]);
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
