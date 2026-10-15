'use client';

import React, { Suspense } from 'react';
import { useAppStore } from '@/lib/store';
import TeacherAssignmentsView from '@/features/assignments/TeacherAssignmentsView';
import StudentAssignmentsView from '@/features/assignments/StudentAssignmentsView';

function AssignmentsContent() {
  const { currentUser } = useAppStore();

  if (currentUser?.role === 'student') {
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

