'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import EvaluationResultView from '@/features/assessment/EvaluationResultView';
import { useAppStore } from '@/lib/store';
import { isApiMode } from '@/lib/data-mode';
import UnimplementedPanel from '@/components/UnimplementedPanel';

export default function StudentResultPage() {
  if (isApiMode()) {
    return (
      <UnimplementedPanel
        title="Kết quả chấm chưa có API"
        description="Công bố điểm và nhận xét rubric thuộc feature assessment, chưa có trong socratic-integration."
      />
    );
  }
  return <MockStudentResultPage />;
}

function MockStudentResultPage() {
  const params = useParams();
  const assignmentId = (params?.id as string) || 'assign-nlxh-01';
  const { assignments } = useAppStore();
  const assignment = assignments.find((a) => a.id === assignmentId);

  return (
    <StudentShell
      headerTitle="Kết quả đánh giá Rubric"
      headerSubtitle={assignment?.title || 'Bài viết số 1: Ý chí và lòng kiên định'}
    >
      <EvaluationResultView viewMode="student" assignmentId={assignmentId} />
    </StudentShell>
  );
}

