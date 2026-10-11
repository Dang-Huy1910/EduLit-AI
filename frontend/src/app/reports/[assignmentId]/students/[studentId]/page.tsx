'use client';

import React from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import EvaluationResultView from '@/features/assessment/EvaluationResultView';

export default function TeacherStudentResultPage() {
  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/reports" className="hover:text-primary">
            Báo cáo lớp 12A1
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">Bùi Hà My (HS 48) - 7.5đ</span>
        </div>
      }
    >
      <EvaluationResultView viewMode="teacher" />
    </TeacherShell>
  );
}

