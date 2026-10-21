'use client';

import React, { Suspense } from 'react';
import { useAppStore } from '@/lib/store';
import TeacherClassroomDetailView from '@/features/classrooms/TeacherClassroomDetailView';

function ClassroomDetailContent() {
  const { currentUser } = useAppStore();
  if (currentUser?.role === 'student') {
    // PR3: StudentClassroomsView
    return null;
  }
  return <TeacherClassroomDetailView />;
}

export default function ClassroomDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <ClassroomDetailContent />
    </Suspense>
  );
}
