'use client';

import React, { Suspense } from 'react';
import { useAppStore } from '@/lib/store';
import TeacherClassroomsView from '@/features/classrooms/TeacherClassroomsView';
import StudentClassroomsView from '@/features/classrooms/StudentClassroomsView';

function ClassroomsContent() {
  const { currentUser } = useAppStore();
  if (currentUser?.role === 'student') {
    return <StudentClassroomsView />;
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
