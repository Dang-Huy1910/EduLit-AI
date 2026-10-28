'use client';

import { useParams } from 'next/navigation';
import FeedbackPrintView from '@/features/assessment/FeedbackPrintView';

export default function PrintPage() {
  const params = useParams<{ assignmentId: string }>();
  return <FeedbackPrintView assignmentId={params.assignmentId} />;
}
