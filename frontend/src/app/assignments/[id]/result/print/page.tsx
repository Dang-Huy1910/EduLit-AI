'use client';

import { useParams } from 'next/navigation';
import FeedbackPrintView from '@/features/assessment/FeedbackPrintView';

export default function PrintPage() {
  const params = useParams<{ id: string }>();
  return <FeedbackPrintView assignmentId={params.id} student />;
}
