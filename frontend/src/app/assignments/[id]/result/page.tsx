'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { submissionApi } from '@/features/submission/api';
import type { SubmissionPayload } from '@/features/submission/types';
import { AuthApiError } from '@/lib/auth-types';

export default function StudentResultPage() {
  const params = useParams();
  const assignmentId = (params?.id as string) || '';
  const [payload, setPayload] = useState<SubmissionPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const data = await submissionApi.getOcr(assignmentId);
        setPayload(data);
      } catch (err) {
        setError(err instanceof AuthApiError ? err.message : 'Không tải được trạng thái bài nộp.');
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId]);

  const title = payload?.assignment.title || 'Bài tập';
  const code = payload?.assignment.code || '';

  return (
    <StudentShell headerTitle="Bài đã nộp" headerSubtitle={`${code}: ${title}`}>
      <div className="max-w-4xl mx-auto space-y-4">
        <AssignmentWorkflowStepper currentStep="result" assignmentId={assignmentId} />
        {loading ? (
          <div className="p-8 text-sm text-on-surface-variant">Đang tải trạng thái bài...</div>
        ) : error ? (
          <div className="p-6 rounded-xl border text-sm text-error">{error}</div>
        ) : payload?.waitingForGrade || payload?.status === 'confirmed' ? (
          <div className="p-6 bg-surface-container-lowest rounded-xl border space-y-3">
            <h1 className="font-merriweather font-bold text-lg">Bài đã nộp chính thức</h1>
            <p className="text-sm text-on-surface-variant">
              Em đã nộp bài. Giáo viên nhận được bài của em. Điểm rubric sẽ có khi hệ thống mở chấm.
            </p>
            <Link href={`/assignments/${assignmentId}/ocr`} className="text-primary text-sm font-semibold">
              Xem lại bài đã nộp
            </Link>
          </div>
        ) : (
          <div className="p-6 bg-surface-container-lowest rounded-xl border space-y-3 text-sm">
            <p>Chưa có kết quả đánh giá. Hãy hoàn tất nộp ảnh và xác nhận bản chép OCR trước.</p>
            <div className="flex gap-3">
              <Link href={`/assignments/${assignmentId}/submit`} className="text-primary font-semibold">
                Bước 3 — Nộp ảnh
              </Link>
              <Link href={`/assignments/${assignmentId}/ocr`} className="text-primary font-semibold">
                Bước 4 — Kiểm tra OCR
              </Link>
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
