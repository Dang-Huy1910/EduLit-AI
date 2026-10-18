'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import EvaluationResultView from '@/features/assessment/EvaluationResultView';
import { useAppStore } from '@/lib/store';
import { CENTRAL_ASSIGNMENT_ID, CENTRAL_ASSIGNMENT } from '@/lib/mock/assignmentData';

export default function StudentResultPage() {
  const params = useParams();
  const assignmentId = (params?.id as string) || CENTRAL_ASSIGNMENT_ID;
  const { assignments, currentUser } = useAppStore();
  const assignment = assignments.find((a) => a.id === assignmentId) || (assignmentId === CENTRAL_ASSIGNMENT_ID ? CENTRAL_ASSIGNMENT : assignments[0]);

  return (
    <StudentShell
      headerTitle="Kết quả đánh giá Rubric (GDPT 2018)"
      headerSubtitle={`${assignment?.code}: ${assignment?.title}`}
    >
      <EvaluationResultView
        viewMode="student"
        assignmentId={assignmentId}
        studentId={currentUser?.id || ''}
      />
    </StudentShell>
  );
}
