'use client';

import { useParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import WritingProfileScreen from '@/features/writing-profile/WritingProfileScreen';

export default function StudentWritingProfilePage() {
  const params = useParams();
  const { currentUser } = useAppStore();
  const classroomId = typeof params?.id === 'string' ? params.id : '';
  const studentId = typeof params?.studentId === 'string' ? params.studentId : '';
  if (currentUser?.role !== 'teacher' || !classroomId || !studentId) return null;
  return <WritingProfileScreen mode="teacher" classroomId={classroomId} studentId={studentId} />;
}
