import { formatScore } from './labels';
import { printRoundCopy } from './revision';
import type { FeedbackSheetData } from './print-model';

/** Shared by teacher and student print pages. Keep publication data separate from review UI. */
export default function FeedbackSheet({ data }: { data: FeedbackSheetData }) {
  const { result } = data;
  const roundCopy = printRoundCopy(data.revisionRound, data.firstPublishedScore);
  return <article className="feedback-sheet">
    <header className="sheet-heading">
      <p>EDULIT-AI · PHIẾU NHẬN XÉT BÀI VIẾT</p>
      <h1>{data.assignmentTitle}</h1>
    </header>
    <dl className="sheet-meta">
      <div><dt>Học sinh</dt><dd>{data.studentName} ({data.studentCode})</dd></div>
      <div><dt>Lớp</dt><dd>{data.classroomName}</dd></div>
      <div><dt>Ngày công bố</dt><dd>{data.publishedAt ? new Date(data.publishedAt).toLocaleString('vi-VN') : '—'}</dd></div>
      <div><dt>Bản</dt><dd>{roundCopy.roundLine}</dd></div>
      {roundCopy.previousLine && <div><dt>Điểm bản 1</dt><dd>{roundCopy.previousLine}</dd></div>}
    </dl>
    <p className="sheet-score">Điểm tổng: <strong>{formatScore(result.totalScore)} / {formatScore(result.maxScore)}</strong> · Thang 10: <strong>{formatScore(result.scoreScale10)} / 10</strong></p>
    <table>
      <thead><tr><th>Tiêu chí</th><th>Điểm đạt / tối đa</th><th>Nhận xét đã công bố</th></tr></thead>
      <tbody>{result.evaluations.map((evaluation) => <tr key={evaluation.criterionId}>
        <td>{evaluation.criterionName}</td>
        <td>{formatScore(evaluation.awardedScore)} / {formatScore(evaluation.maxScore)}</td>
        <td>
          <p>{evaluation.comment}</p>
          {evaluation.strengths?.length > 0 && <p>Làm tốt: {evaluation.strengths.join('; ')}</p>}
          {evaluation.weaknesses?.length > 0 && <p>Cần cải thiện: {evaluation.weaknesses.join('; ')}</p>}
        </td>
      </tr>)}</tbody>
    </table>
    <section><h2>Nhận xét chung</h2><p>{result.overallComment || '—'}</p></section>
    {result.improvementGuidance.length > 0 && <section><h2>Hướng cải thiện</h2><ul>{result.improvementGuidance.map((line, index) => <li key={index}>{line}</li>)}</ul></section>}
  </article>;
}
