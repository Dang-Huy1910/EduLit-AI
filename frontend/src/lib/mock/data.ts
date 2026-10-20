import {
  CENTRAL_ASSIGNMENT_ID,
  CENTRAL_ASSIGNMENT,
  RUBRIC_MAU_TU_DO_DAT,
  MATERIALS_MAU_TU_DO_DAT,
  DEMO_TEACHER,
  DEMO_STUDENTS,
} from './assignmentData';
import {
  INITIAL_SUBMISSIONS,
  SUBMISSION_MANIFEST,
} from './submissionsManifest';

export const SCHOOL_NAME = 'THPT Đan Phượng';

export const MOCK_TEACHER = DEMO_TEACHER;
export const MOCK_STUDENT = DEMO_STUDENTS[0]; // Đỗ Đăng An (STT 1)
export const MOCK_STUDENT_KHOI = DEMO_STUDENTS[1]; // Nguyễn Thu An (STT 2)
export const MOCK_STUDENT_LAN_ANH = DEMO_STUDENTS[2]; // Nguyễn Thị Ngọc Anh (STT 3)

export const MOCK_RUBRIC = RUBRIC_MAU_TU_DO_DAT;
export const MOCK_ASSIGNMENTS = [CENTRAL_ASSIGNMENT];
export const MOCK_MATERIALS = MATERIALS_MAU_TU_DO_DAT;

// Default transcription lines from Đỗ Đăng An (Trang 1 + Trang 2)
export const MOCK_TRANSCRIPTION_LINES = [
  ...(SUBMISSION_MANIFEST['user-student-11a14-001']?.transcriptionByPage?.[0]?.lines || []),
  ...(SUBMISSION_MANIFEST['user-student-11a14-001']?.transcriptionByPage?.[1]?.lines || []),
];

export const MOCK_STUDENT_RESULT = INITIAL_SUBMISSIONS['sub-user-student-11a14-001'];

// Dynamically calculated report metrics based on current submissions
export function computeReportMetrics(
  submissions: Record<string, any>,
  assignmentId: string = CENTRAL_ASSIGNMENT_ID
) {
  const allSubs = Object.values(submissions);
  const subList = allSubs.filter((s: any) => !assignmentId || s.assignmentId === assignmentId);
  const totalStudents = DEMO_STUDENTS.length; // Class size (41 HS)
  const submittedCount = subList.length;
  const assessedCount = subList.filter((s) => s.status === 'graded').length;
  const flaggedCount = subList.reduce((sum, s) => sum + (s.flaggedSegmentsCount || 0), 0);

  const meanScore =
    assessedCount > 0
      ? Number((subList.reduce((sum, s) => sum + s.totalScore, 0) / assessedCount).toFixed(2))
      : 0;

  const meanScoreScale10 =
    assessedCount > 0
      ? Number((subList.reduce((sum, s) => sum + s.scoreScale10, 0) / assessedCount).toFixed(2))
      : 0;

  // Grade distributions (on 4.0 scale and 10 scale)
  const scoreDistribution = [
    { range: '[0.0–2.0) (Dưới 5.0đ)', count: subList.filter((s) => s.totalScore < 2.0).length, label: 'Dưới TB' },
    { range: '[2.0–2.6) (5.0–6.5đ)', count: subList.filter((s) => s.totalScore >= 2.0 && s.totalScore < 2.6).length, label: 'Trung bình' },
    { range: '[2.6–3.2) (6.5–8.0đ)', count: subList.filter((s) => s.totalScore >= 2.6 && s.totalScore < 3.2).length, label: 'Khá' },
    { range: '[3.2–3.6) (8.0–9.0đ)', count: subList.filter((s) => s.totalScore >= 3.2 && s.totalScore < 3.6).length, label: 'Khá Giỏi' },
    { range: '[3.6–4.0] (9.0–10đ)', count: subList.filter((s) => s.totalScore >= 3.6).length, label: 'Giỏi' },
  ];

  // Dynamic common issues from actual evaluations in subList
  const issueRelationCount = subList.filter((s) =>
    s.evaluations?.some((e: any) =>
      e.criterionId === 'C1_CONTENT_ART_RELATION' &&
      (e.awardedScore < e.maxScore || (e.weaknesses && e.weaknesses.some((w: string) => w.toLowerCase().includes('liên hệ'))))
    )
  ).length;

  const issueParadoxCount = subList.filter((s) =>
    s.evaluations?.some((e: any) =>
      e.weaknesses && e.weaknesses.some((w: string) => w.toLowerCase().includes('nghịch lí') || w.toLowerCase().includes('diễn xuôi'))
    )
  ).length;

  const issueStructureCount = subList.filter((s) =>
    s.evaluations?.some((e: any) =>
      e.criterionId === 'C2_ANALYSIS_ARGUMENT' && e.awardedScore < e.maxScore
    )
  ).length;

  const commonIssues = [
    {
      criterionId: 'C1_CONTENT_ART_RELATION',
      issueType: 'Thiếu hoặc chưa làm nổi bật nét riêng khi liên hệ tác phẩm ngoài',
      count: issueRelationCount,
      total: assessedCount,
      percentage: assessedCount > 0 ? `${Math.round((issueRelationCount / assessedCount) * 100)}%` : '0%',
      impact: 'Mất điểm tiêu chí Liên hệ mở rộng (tiêu chí C1)',
      action: 'Dành 15 phút đầu tiết: Hướng dẫn so sánh nét riêng của Trần Quang Quý với "Bếp lửa" (Bằng Việt) và "Quê hương" (Tế Hanh).',
    },
    {
      criterionId: 'C1_CONTENT_ART_RELATION',
      issueType: 'Diễn xuôi thơ, chưa phân tích sâu nghịch lí "không thoát ly bùn đất"',
      count: issueParadoxCount,
      total: assessedCount,
      percentage: assessedCount > 0 ? `${Math.round((issueParadoxCount / assessedCount) * 100)}%` : '0%',
      impact: 'Chưa chạm vào chiều sâu triết lí của tự do (tiêu chí C1)',
      action: 'Tổ chức thảo luận nhóm: Phân tích nghịch lí khát vọng thoát nhọc nhằn cơ bắp song tự do đích thực gắn liền với đất đai.',
    },
    {
      criterionId: 'C2_ANALYSIS_ARGUMENT',
      issueType: 'Chưa khai thác trục liên kết chuỗi động từ buộc – neo – cởi',
      count: issueStructureCount,
      total: assessedCount,
      percentage: assessedCount > 0 ? `${Math.round((issueStructureCount / assessedCount) * 100)}%` : '0%',
      impact: 'Chưa thấy được kết cấu vòng tròn ngọn khói',
      action: 'Vẽ sơ đồ tư duy liên kết 3 động từ "buộc" (khổ 1), "neo" (khổ 3), "cởi" (khổ 4).',
    },
  ];

  const studentRows = DEMO_STUDENTS.map((student) => {
    const sub = subList.find((s) => s.studentId === student.id);
    return {
      id: student.id,
      submissionId: sub ? sub.id : `sub-${student.id}`,
      name: student.name,
      code: student.code || '',
      score: sub ? sub.totalScore : 0,
      scoreScale10: sub ? sub.scoreScale10 : 0,
      status: sub
        ? sub.status === 'graded'
          ? 'Đã chấm Rubric'
          : 'Đã nộp bài (Chờ chấm)'
        : 'Chưa nộp bài',
      isPublished: sub ? sub.isPublishedToStudent : false,
      pagesCount: sub ? sub.pages.length : 0,
    };
  });

  return {
    classId: '12A14',
    className: 'Lớp 12A14 • THPT Đan Phượng (Sĩ số 41 HS)',
    schoolName: SCHOOL_NAME,
    totalStudents,
    submittedCount,
    assessedCount,
    flaggedCount,
    meanScore,
    meanScoreScale10,
    scoreDistribution,
    commonIssues,
    studentRows,
  };
}

export const MOCK_REPORT_METRICS = computeReportMetrics(INITIAL_SUBMISSIONS);
