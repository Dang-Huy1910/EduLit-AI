'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import EvaluationResultView from '@/features/assessment/EvaluationResultView';

export default function TeacherStudentAssessmentPage() {
  const params = useParams();
  const assignmentId = (params?.id as string) || '';
  const studentId = (params?.studentId as string) || '';

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span className="text-outline-variant">/</span>
          <Link
            href={assignmentId ? `/assignments/${assignmentId}?tab=submissions` : '/assignments'}
            className="hover:text-primary"
          >
            Bài nộp &amp; Chấm điểm
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">Chi tiết bài chấm</span>
        </div>
      }
    >
      {assignmentId && studentId ? (
        <EvaluationResultView
          viewMode="teacher"
          assignmentId={assignmentId}
          studentId={studentId}
          backHref={`/assignments/${assignmentId}?tab=submissions`}
          backLabel="Bài nộp của đề này"
        />
      ) : (
        <div className="p-8 text-sm text-error">Thiếu mã bài tập hoặc học sinh.</div>
      )}
    </TeacherShell>
  );
}
