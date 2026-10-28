'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import TeacherShell from '@/components/TeacherShell';
import AssignmentSubmissionsPanel from '@/features/assessment/AssignmentSubmissionsPanel';
import { catalogApi } from '@/features/catalog/api';
import type { TeacherAssignment } from '@/features/catalog/types';

export default function AssignmentReportPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<TeacherAssignment | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void catalogApi.getTeacherAssignment(assignmentId).then((data) => { if (active) setAssignment(data); })
      .catch(() => { if (active) setError('Không tải được bài tập. Hãy tải lại trang.'); });
    return () => { active = false; };
  }, [assignmentId]);
  return <TeacherShell><div className="max-w-7xl mx-auto space-y-5">
    <Link href="/reports" className="text-secondary text-sm hover:underline">Báo cáo năng lực</Link>
    <h1 className="font-merriweather text-2xl font-bold">Báo cáo bài tập{assignment ? `: ${assignment.title}` : ''}</h1>
    {error && <p role="alert" className="text-error">{error}</p>}
    {assignment && <AssignmentSubmissionsPanel assignmentId={assignmentId} readOnly={assignment.classroomReadOnly} reportView />}
  </div></TeacherShell>;
}
