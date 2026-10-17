'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import EvaluationResultView from '@/features/assessment/EvaluationResultView';
import { useAppStore } from '@/lib/store';
import { CENTRAL_ASSIGNMENT_ID, CENTRAL_ASSIGNMENT } from '@/lib/mock/assignmentData';

export default function TeacherStudentResultPage() {
  const params = useParams();
  const assignmentId = (params?.assignmentId as string) || CENTRAL_ASSIGNMENT_ID;
  const studentId = params?.studentId as string;

  const { getStudentSubmission, assignments } = useAppStore();
  const assignment = assignments.find((a) => a.id === assignmentId) || (assignmentId === CENTRAL_ASSIGNMENT_ID ? CENTRAL_ASSIGNMENT : assignments[0]);
  const submission = studentId ? getStudentSubmission(assignmentId, studentId) : undefined;

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/reports" className="hover:text-primary">
            Báo cáo lớp 11A14
          </Link>
          <span className="text-outline-variant">/</span>
          {submission ? (
            <span className="text-on-surface font-semibold">
              {submission.studentName} ({submission.studentCode}) — {submission.totalScore.toFixed(2)}đ / 4,00đ
            </span>
          ) : (
            <span className="text-error font-semibold">Không tìm thấy bài nộp</span>
          )}
        </div>
      }
    >
      <EvaluationResultView
        viewMode="teacher"
        assignmentId={assignmentId}
        studentId={studentId}
      />
    </TeacherShell>
  );
}
