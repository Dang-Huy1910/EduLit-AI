'use client';

import React, { Suspense } from 'react';
import { useAppStore } from '@/lib/store';
import TeacherAssignmentsView from '@/features/assignments/TeacherAssignmentsView';
import StudentAssignmentsView from '@/features/assignments/StudentAssignmentsView';
import ApiStudentAssignmentsView from '@/features/assignments/ApiStudentAssignmentsView';
import ApiTeacherAssignmentsView from '@/features/assignments/ApiTeacherAssignmentsView';
import { isApiMode } from '@/lib/data-mode';
import { useApiAuthStore } from '@/lib/api-auth-store';

function AssignmentsContent() {
  const { currentUser } = useAppStore();
  const apiUser = useApiAuthStore((state) => state.user);

  if (isApiMode()) {
    if (apiUser?.role === 'TEACHER') {
      return <ApiTeacherAssignmentsView />;
    }
    return <ApiStudentAssignmentsView />;
  }

  if (currentUser.role === 'student') {
    return <StudentAssignmentsView />;
  }

  return <TeacherAssignmentsView />;
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
      </div>
    }>
      <AssignmentsContent />
    </Suspense>
  );
}

