'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthApiError } from '@/lib/auth-types';
import type { ClassroomSummary, Term } from '@/features/catalog/types';
import { classroomsApi } from './api';
import { useClassContext } from './class-context';
import { pickDefaultClassroom, pickDefaultTerm } from './model';

export function useTeacherClassContext(
  { role = 'teacher', includeArchived = false }: { role?: 'teacher' | 'student'; includeArchived?: boolean } = {}
) {
  const termId = useClassContext((state) => state.termId);
  const classroomId = useClassContext((state) => state.classroomId);
  const setStoredTerm = useClassContext((state) => state.setTerm);
  const setStoredClassroom = useClassContext((state) => state.setClassroom);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [termsLoading, setTermsLoading] = useState(true);
  const [classroomsLoading, setClassroomsLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (role !== 'teacher') {
      setTerms([]);
      setClassrooms([]);
      setTermsLoading(false);
      return;
    }
    let active = true;
    setTermsLoading(true);
    setError('');
    void classroomsApi
      .listTerms()
      .then(({ items }) => {
        if (!active) return;
        setTerms(items);
        const storedTermId = useClassContext.getState().termId;
        const selected = items.find((term) => term.id === storedTermId) || pickDefaultTerm(items);
        if (selected && selected.id !== storedTermId) setStoredTerm(selected.id);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof AuthApiError ? err.message : 'Không tải được danh sách kỳ học.');
      })
      .finally(() => {
        if (active) setTermsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, reloadNonce, setStoredTerm]);

  useEffect(() => {
    if (role !== 'teacher' || !termId) {
      setClassrooms([]);
      setClassroomsLoading(false);
      return;
    }
    let active = true;
    setClassroomsLoading(true);
    setError('');
    void classroomsApi
      .listTeacherClassrooms({ termId, includeArchived })
      .then(({ items }) => {
        if (!active) return;
        setClassrooms(items);
        const storedClassroomId = useClassContext.getState().classroomId;
        const selected = pickDefaultClassroom(items, storedClassroomId);
        if (selected && selected.id !== storedClassroomId) setStoredClassroom(selected.id);
        if (!selected && storedClassroomId) setStoredClassroom('');
      })
      .catch((err: unknown) => {
        if (active) {
          setClassrooms([]);
          setError(err instanceof AuthApiError ? err.message : 'Không tải được danh sách lớp.');
        }
      })
      .finally(() => {
        if (active) setClassroomsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, termId, includeArchived, reloadNonce, setStoredClassroom]);

  const reload = useCallback(() => setReloadNonce((value) => value + 1), []);
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
    reload,
  };
}
