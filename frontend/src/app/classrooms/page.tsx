'use client';

import React, { Suspense } from 'react';
import { useAppStore } from '@/lib/store';
import TeacherClassroomsView from '@/features/classrooms/TeacherClassroomsView';

function ClassroomsContent() {
  const { currentUser } = useAppStore();
  if (currentUser?.role === 'student') {
    // PR3: StudentClassroomsView
    return null;
  }
  return <TeacherClassroomsView />;
}

export default function ClassroomsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <ClassroomsContent />
    </Suspense>
  );
}
