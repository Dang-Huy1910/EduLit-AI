'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function LegacyTeacherStudentResultRedirect() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = (params?.assignmentId as string) || '';
  const studentId = (params?.studentId as string) || '';

  useEffect(() => {
    if (assignmentId && studentId) {
      router.replace(`/assignments/${assignmentId}/students/${studentId}/assessment`);
    } else {
      router.replace('/reports');
    }
  }, [assignmentId, studentId, router]);

  return <div className="p-8 text-sm text-on-surface-variant">Đang chuyển tới chi tiết bài chấm...</div>;
}
