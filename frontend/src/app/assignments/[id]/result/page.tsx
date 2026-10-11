'use client';

import React from 'react';
import StudentShell from '@/components/StudentShell';
import EvaluationResultView from '@/features/assessment/EvaluationResultView';

export default function StudentResultPage() {
  return (
    <StudentShell headerTitle="Kết quả đánh giá Rubric" headerSubtitle="Bài viết số 1: Ý chí và lòng kiên định">
      <EvaluationResultView viewMode="student" />
    </StudentShell>
  );
}

