'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import EvaluationResultView from '@/features/assessment/EvaluationResultView';
import StudentRevisionActions from '@/features/assessment/StudentRevisionActions';
import { assessmentApi } from '@/features/assessment/api';
import type { StudentAssessmentResponse } from '@/features/assessment/types';
import { AuthApiError } from '@/lib/auth-types';

const POLL_STATUSES = new Set([
  'queued',
  'grading',
  'awaiting_review',
  'new_version_grading',
  'new_version_review',
]);

function statusTitle(status: string): string {
  if (status === 'queued' || status === 'grading') return 'Hệ thống đang chấm bài';
  if (status === 'failed') return 'Lượt chấm gặp lỗi';
  if (status === 'awaiting_review') return 'Đã chấm xong, chờ công bố';
  if (status === 'revising') return 'Em đang sửa bản chép';
  if (status === 'new_version_grading') return 'Bản nộp mới đang được chấm';
  if (status === 'new_version_review') return 'Bản nộp mới chờ giáo viên công bố';
  if (status === 'new_version_failed') return 'Bản nộp mới chấm lỗi';
  if (status === 'none') return 'Chưa có kết quả đánh giá';
  return 'Bài đã nộp chính thức';
}

function statusBody(status: string, jobError: string | null): string {
  if (status === 'queued' || status === 'grading') {
    return 'Em đã nộp bài chính thức. Hệ thống đang chấm theo barem đã giao. Điểm chỉ hiện sau khi giáo viên rà soát và công bố.';
  }
  if (status === 'failed') {
    return jobError
      ? `Không chấm được bài: ${jobError}`
      : 'Lượt chấm không thành công. Giáo viên có thể thử lại. Điểm không được tạo giả.';
  }
  if (status === 'awaiting_review') {
    return 'Bài đã được chấm theo barem. Em sẽ thấy điểm và nhận xét khi giáo viên công bố.';
  }
  if (status === 'revising') {
    return 'Em đang mở bản chép để sửa. Hãy xác nhận lại ở bước 4 để nộp chính thức phiên bản mới.';
  }
  if (status === 'new_version_grading' || status === 'new_version_review' || status === 'new_version_failed') {
    return 'Bản nộp mới chưa thay thế kết quả đã công bố. Điểm đang xem (nếu có) thuộc bản trước.';
  }
  return 'Hãy hoàn tất nộp ảnh và xác nhận bản chép OCR trước khi có kết quả.';
}

export default function StudentResultPage() {
  const params = useParams();
  const assignmentId = (params?.id as string) || '';
  const [data, setData] = useState<StudentAssessmentResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await assessmentApi.student(assignmentId);
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof AuthApiError ? err.message : 'Không tải được kết quả đánh giá.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  useEffect(() => {
    const status = data?.assessment.status || '';
    if (!POLL_STATUSES.has(status)) return;
    const timer = window.setInterval(() => {
      void assessmentApi
        .student(assignmentId)
        .then(setData)
        .catch(() => {
          /* keep waiting; polling is read-only */
        });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [assignmentId, data?.assessment.status]);

  const title = data?.assignment.title || 'Bài tập';
  const code = data?.assignment.code || '';
  const status = data?.assessment.status || 'none';
  const canView = Boolean(data?.assessment.canViewResult && data.assessment.result);
  const confirmed = Boolean(data?.officialSubmittedAt) || data?.status === 'confirmed';

  return (
    <StudentShell headerTitle="Kết quả đánh giá" headerSubtitle={`${code}: ${title}`}>
      {loading ? (
        <div className="max-w-4xl mx-auto p-8 text-sm text-on-surface-variant">Đang tải kết quả...</div>
      ) : error ? (
        <div className="max-w-4xl mx-auto p-6 rounded-xl border text-sm text-error">{error}</div>
      ) : canView && data ? (
        <EvaluationResultView viewMode="student" assignmentId={assignmentId} studentData={data} />
      ) : (
        <div className="max-w-4xl mx-auto space-y-4">
          <AssignmentWorkflowStepper currentStep="result" assignmentId={assignmentId} />
          <div className="p-6 bg-surface-container-lowest rounded-xl border space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Bước 5
              </span>
              {confirmed ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary-container/40 text-tertiary">
                  Đã nộp chính thức
                </span>
              ) : null}
            </div>
            <h1 className="font-merriweather font-bold text-lg">{statusTitle(status)}</h1>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {statusBody(status, data?.assessment.jobError || null)}
            </p>
            {data && <StudentRevisionActions assignmentId={assignmentId} submission={data} />}
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href={`/assignments/${assignmentId}/ocr`} className="text-primary text-sm font-semibold">
                Xem lại bản chép
              </Link>
              <Link href={`/assignments/${assignmentId}/submit`} className="text-primary text-sm font-semibold">
                Bước 3 — Ảnh bài viết
              </Link>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
