'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { assessmentApi } from './api';
import { catalogApi } from '@/features/catalog/api';
import { AuthApiError } from '@/lib/auth-types';
import FeedbackSheet from './FeedbackSheet';
import { applyPrintRound, mapConcurrent, studentFeedbackSheet, teacherFeedbackSheet, type FeedbackSheetData } from './print-model';
import '@/styles/feedback-print.css';

export default function FeedbackPrintView({ assignmentId, studentId, student = false }: { assignmentId: string; studentId?: string; student?: boolean }) {
  const [sheets, setSheets] = useState<FeedbackSheetData[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      setSheets([]);
      setSkipped([]);
      setFailed([]);
      try {
        if (student) {
          const [data, assignment, rounds] = await Promise.all([
            assessmentApi.student(assignmentId),
            catalogApi.getAssignment(assignmentId),
            assessmentApi.studentRounds(assignmentId).catch(() => null),
          ]);
          const firstScore = rounds?.rounds.find((item) => item.round === 1)?.totalScore ?? null;
          const sheet = applyPrintRound(studentFeedbackSheet(data, assignment.classroomName), rounds?.currentPublishedRound, firstScore);
          if (active) {
            setSheets(sheet ? [sheet] : []);
            setSkipped(sheet ? [] : [data.student.displayName]);
          }
        } else if (studentId) {
          const [detail, rounds] = await Promise.all([
            assessmentApi.teacherDetail(assignmentId, studentId),
            assessmentApi.teacherRounds(assignmentId, studentId).catch(() => null),
          ]);
          const firstScore = rounds?.rounds.find((item) => item.round === 1)?.totalScore ?? null;
          const sheet = applyPrintRound(teacherFeedbackSheet(detail), rounds?.currentPublishedRound, firstScore);
          if (active) {
            setSheets(sheet ? [sheet] : []);
            setSkipped(sheet ? [] : [detail.student.displayName]);
          }
        } else {
          const first = await assessmentApi.classReport(assignmentId, { mode: 'official', page: 1, pageSize: 100 });
          const rows = [...first.students.items];
          for (let page = 2; page <= first.students.totalPages && active; page++) {
            const report = await assessmentApi.classReport(assignmentId, { mode: 'official', page, pageSize: 100 });
            rows.push(...report.students.items);
          }
          const results = await mapConcurrent(rows, async (row) => {
            if (!active) return { sheet: null, skipped: '', failed: '' };
            try {
              const detail = await assessmentApi.teacherDetail(assignmentId, row.studentId);
              const sheet = applyPrintRound(teacherFeedbackSheet(detail), row.publishedRound, row.firstPublishedScore);
              return { sheet, skipped: sheet ? '' : row.name, failed: '' };
            } catch {
              return { sheet: null, skipped: '', failed: row.name };
            }
          });
          if (active) {
            setSheets(results.flatMap((result) => result.sheet ? [result.sheet] : []));
            setSkipped(results.map((result) => result.skipped).filter(Boolean));
            setFailed(results.map((result) => result.failed).filter(Boolean));
          }
        }
      } catch (err) {
        if (active) setError(err instanceof AuthApiError ? err.message : 'Không tải được phiếu nhận xét.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [assignmentId, studentId, student, retry]);

  return <main className="feedback-print-view">
    <div className="print-controls">
      <Link href={student ? `/assignments/${assignmentId}/result` : `/reports/${assignmentId}`}>← Quay lại kết quả</Link>
      <h1>Phiếu nhận xét{!student && !studentId ? ' cả lớp' : ''}</h1>
      <p>Chỉ in điểm và nhận xét đã công bố cho học sinh.</p>
      <button type="button" disabled={loading || sheets.length === 0 || failed.length > 0 || Boolean(error)} onClick={() => window.print()}>In / Lưu PDF</button>
      {(error || failed.length > 0) && <button type="button" onClick={() => setRetry((value) => value + 1)}>Tải lại phiếu</button>}
      {loading && <p role="status">Đang tải phiếu nhận xét...</p>}
      {error && <p role="alert">{error}</p>}
      {failed.length > 0 && <p role="alert">Chưa tải được phiếu của: {failed.join(', ')}. Hãy tải lại trước khi in.</p>}
      {!loading && !error && <p>{sheets.length} phiếu đã công bố.</p>}
    </div>
    <div className="print-document">
      {sheets.map((sheet) => <FeedbackSheet key={sheet.studentCode} data={sheet} />)}
      {!loading && skipped.length > 0 && <section className="print-skipped"><h2>Học sinh bỏ qua vì chưa có kết quả công bố</h2><ul>{skipped.map((name, index) => <li key={index}>{name}</li>)}</ul></section>}
    </div>
  </main>;
}
