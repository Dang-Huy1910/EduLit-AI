'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { computeReportMetrics } from '@/lib/mock/data';
import { CENTRAL_ASSIGNMENT_ID } from '@/lib/mock/assignmentData';

export default function ReportsPage() {
  const {
    submissions,
    assignments,
    demoMilestone,
    setDemoMilestone,
    resetDemoState,
    addToast,
  } = useAppStore();

  const [studentSearch, setStudentSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const assignment = assignments.find((a) => a.id === CENTRAL_ASSIGNMENT_ID) || assignments[0];
  const metrics = computeReportMetrics(submissions);

  const filteredStudents = metrics.studentRows.filter((s) => {
    if (
      studentSearch &&
      !s.name.toLowerCase().includes(studentSearch.toLowerCase()) &&
      !s.code.toLowerCase().includes(studentSearch.toLowerCase())
    ) {
      return false;
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'published' && !s.isPublished) return false;
      if (filterStatus === 'pending' && s.isPublished) return false;
    }
    return true;
  });

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">Báo cáo năng lực lớp &amp; Gợi ý dạy học</span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Báo cáo sư phạm GDPT 2018 (Thang 4,0 điểm)
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {metrics.className}
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
              Báo cáo năng lực: {assignment.title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => addToast('Chức năng xuất PDF/Excel là mô phỏng trong prototype.', 'info')}
              className="px-3.5 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              <span>Xuất PDF / Excel</span>
            </button>
            <button
              onClick={() => addToast('Đã gửi phản hồi chung tới các học sinh trong lớp.', 'success')}
              className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>Gửi phản hồi chung</span>
            </button>
          </div>
        </div>

        {/* Demo Milestone Switcher Bar */}
        <div className="p-3 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-secondary">tune</span>
            <span className="font-semibold text-on-surface">Chuyển đổi mốc trình diễn:</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDemoMilestone('start');
                addToast('Đã chọn mốc: Bắt đầu kịch bản (2 bài của Khôi & Lan Anh, Bùi Hà My chưa nộp)', 'info');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                demoMilestone === 'start'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Mốc 1: Bắt đầu kịch bản (2 bài)
            </button>
            <button
              onClick={() => {
                setDemoMilestone('complete');
                addToast('Đã chọn mốc: Xem dữ liệu hoàn chỉnh (đủ 3 bài nộp)', 'info');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                demoMilestone === 'complete'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Mốc 2: Dữ liệu hoàn chỉnh (3 bài)
            </button>
            <button
              onClick={() => {
                resetDemoState();
                addToast('Đã reset dữ liệu demo về mốc ban đầu!', 'success');
              }}
              className="px-2.5 py-1 text-xs text-error font-semibold hover:bg-error-container/30 rounded flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Transparency Banner - Distinguishes class size (40) vs demo submissions count */}
        <div className="p-4 bg-surface-container-low/80 rounded-xl border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-on-surface">
            <span>Sĩ số lớp: <strong>40 học sinh</strong></span>
            <span>•</span>
            <span>Số bài trong dữ liệu demo: <strong>{metrics.submittedCount} bài</strong></span>
            <span>•</span>
            <span className="text-tertiary font-semibold">
              Đã đối chiếu Rubric (4,0đ): <strong>{metrics.assessedCount} bài</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-secondary bg-secondary-fixed/30 px-3 py-1 rounded-full font-medium text-[11px]">
            <span className="material-symbols-outlined text-sm">info</span>
            <span>3 bộ ảnh mẫu tương ứng 3 bài nộp (mỗi bài gồm 2 trang viết tay)</span>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Đã chấm theo Rubric</span>
            <span className="text-2xl font-bold text-on-surface font-merriweather mt-1 block">
              {metrics.assessedCount} / {metrics.submittedCount}
            </span>
            <span className="text-[11px] text-tertiary font-semibold mt-1 block">100% bài demo đã chấm</span>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Điểm trung bình (Thang 4,0đ)</span>
            <span className="text-2xl font-bold text-secondary font-merriweather mt-1 block font-mono">
              {metrics.meanScore.toFixed(2)} / 4,00đ
            </span>
            <span className="text-[11px] text-secondary font-semibold mt-1 block">
              Quy đổi: {metrics.meanScoreScale10.toFixed(2)} / 10.0đ
            </span>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Phân loại học lực (n={metrics.assessedCount})</span>
            <div className="text-xs font-semibold text-on-surface mt-1.5 space-y-0.5">
              <span className="text-tertiary block">
                Giỏi (≥ 3.6đ): {metrics.studentRows.filter((s) => s.score >= 3.6).length} HS
              </span>
              <span className="text-secondary block">
                Khá (2.6 - 3.5đ): {metrics.studentRows.filter((s) => s.score >= 2.6 && s.score < 3.6).length} HS
              </span>
              <span className="text-[#CA8A04] block">
                Cần cố gắng: {metrics.studentRows.filter((s) => s.score < 2.6).length} HS
              </span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Trạng thái công bố</span>
            <span className="text-2xl font-bold text-primary font-merriweather mt-1 block">
              {metrics.studentRows.filter((s) => s.isPublished).length} / {metrics.studentRows.length}
            </span>
            <span className="text-[11px] text-on-surface-variant mt-1 block">Đã hiển thị phía học sinh</span>
          </div>
        </div>

        {/* Pedagogical Insights & Common Issues Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart Left (6 cols) */}
          <div className="lg:col-span-6 bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">bar_chart</span>
                <span>Phổ điểm bài thi (Thang 4,0đ và Thang 10)</span>
              </span>
              <span className="text-[11px] text-on-surface-variant font-medium">n = {metrics.assessedCount} bài</span>
            </div>

            <div className="space-y-3 pt-2">
              {metrics.scoreDistribution.map((item, idx) => {
                const maxCount = Math.max(...metrics.scoreDistribution.map((d) => d.count), 3);
                const percent = (item.count / maxCount) * 100;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-medium text-on-surface">
                        {item.range} ({item.label})
                      </span>
                      <span className="font-bold text-secondary font-mono">{item.count} bài</span>
                    </div>
                    <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Common Issues Right (6 cols) */}
          <div className="lg:col-span-6 bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">psychology_alt</span>
                <span>Gợi ý điều chỉnh giáo án (Căn cứ lỗi phổ biến)</span>
              </span>
            </div>

            <div className="space-y-3">
              {metrics.commonIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-surface-container-low/60 rounded-xl border border-outline-variant/30 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-on-surface">{issue.issueType}</span>
                    <span className="text-[10px] font-bold text-error bg-error-container/40 px-2 py-0.5 rounded-full">
                      {issue.percentage}
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant font-medium">Ảnh hưởng: {issue.impact}</p>
                  <p className="text-[11px] text-primary bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/20">
                    💡 <strong>Hành động đề xuất:</strong> {issue.action}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Student Submissions Table */}
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
            <div>
              <h3 className="font-bold text-sm text-on-surface font-merriweather">
                Danh sách bài nộp của học sinh ({filteredStudents.length} học sinh)
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Mỗi học sinh nộp đúng 2 trang viết tay. Bấm &ldquo;Xem chi tiết chấm&rdquo; để xem ảnh gốc và đối chiếu rubric.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Tìm theo tên hoặc mã HS..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary w-56"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="published">Đã công bố</option>
                <option value="pending">Chưa công bố</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 rounded-l-lg">Họ và tên học sinh</th>
                  <th className="py-2.5 px-3">Mã học sinh</th>
                  <th className="py-2.5 px-3">Số trang ảnh</th>
                  <th className="py-2.5 px-3">Điểm (Thang 4,0đ)</th>
                  <th className="py-2.5 px-3">Quy đổi thang 10</th>
                  <th className="py-2.5 px-3">Công bố</th>
                  <th className="py-2.5 px-3 rounded-r-lg text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-on-surface-variant italic">
                      Chưa có bài nộp nào trong bộ lọc này. (Thử bấm &ldquo;Mốc 2: Dữ liệu hoàn chỉnh&rdquo; bên trên).
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-on-surface block">{st.name}</span>
                        {st.id !== 'user-student-48' && (
                          <span className="text-[10px] text-outline italic">(Tên minh họa demo)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-outline">{st.code}</td>
                      <td className="py-3 px-3 font-mono">{st.pagesCount} trang (đủ)</td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-primary font-mono text-sm">
                          {st.score.toFixed(2)} / 4,00đ
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-secondary font-mono">
                          {st.scoreScale10.toFixed(2)} / 10.0đ
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            st.isPublished
                              ? 'bg-tertiary-container/40 text-tertiary'
                              : 'bg-[#FEF9C3] text-[#CA8A04]'
                          }`}
                        >
                          {st.isPublished ? 'Đã công bố' : 'Chưa công bố'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          href={`/reports/${CENTRAL_ASSIGNMENT_ID}/students/${st.id}`}
                          className="px-3 py-1 bg-secondary text-white rounded text-xs font-semibold hover:bg-secondary/90 transition-all shadow-sm inline-flex items-center gap-1"
                        >
                          <span>Xem chi tiết chấm</span>
                          <span className="material-symbols-outlined text-xs">visibility</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
