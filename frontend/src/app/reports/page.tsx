'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { MOCK_REPORT_METRICS } from '@/lib/mock/data';

export default function ReportsPage() {
  const { addToast } = useAppStore();

  const [studentSearch, setStudentSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredStudents = MOCK_REPORT_METRICS.studentRows.filter((s) => {
    if (studentSearch && !s.name.toLowerCase().includes(studentSearch.toLowerCase()) && !s.code.toLowerCase().includes(studentSearch.toLowerCase())) {
      return false;
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'graded' && s.score === null) return false;
      if (filterStatus === 'pending' && s.score !== null) return false;
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
                Báo cáo sư phạm GDPT 2018
              </span>
              <span className="text-xs text-on-surface-variant font-medium">Lớp 12A1 • THPT Đan Phượng</span>
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
              Báo cáo năng lực lớp &amp; Điều chỉnh giáo án
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
              onClick={() => addToast('Gửi nhận xét chung thành công tới 35 học sinh qua hệ thống.', 'success')}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:brightness-95 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>Gửi phản hồi chung</span>
            </button>
          </div>
        </div>

        {/* Transparency Banner */}
        <div className="p-4 bg-surface-container-low/80 rounded-xl border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-on-surface">
            <span>Sĩ số: <strong>40 học sinh</strong></span>
            <span>•</span>
            <span>Đã nộp bài: <strong>38 bài</strong></span>
            <span>•</span>
            <span className="text-tertiary font-semibold">
              Đã đối chiếu Rubric AI: <strong>35 bài (87.5%)</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-[#CA8A04] bg-[#FEF9C3] px-3 py-1 rounded-full font-medium text-[11px]">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>3 bài flagged (1 lỗi lệch dòng OCR, 2 bản chụp chữ tay mờ)</span>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Đã hoàn tất Rubric</span>
            <span className="text-2xl font-bold text-on-surface font-merriweather mt-1 block">35 / 40</span>
            <span className="text-[11px] text-tertiary font-semibold mt-1 block">Tỷ lệ chấm: 87.5%</span>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Điểm trung bình lớp</span>
            <span className="text-2xl font-bold text-secondary font-merriweather mt-1 block">7.42 / 10</span>
            <span className="text-[11px] text-secondary font-semibold mt-1 block">Phổ điểm phát triển tốt</span>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Phân hạng năng lực (n=35)</span>
            <div className="text-xs font-semibold text-on-surface mt-1.5 space-y-0.5">
              <span className="text-tertiary block">Giỏi: 9 (26%)</span>
              <span className="text-secondary block">Khá: 21 (60%)</span>
              <span className="text-[#CA8A04] block">Cần cố gắng: 5 (14%)</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Cần can thiệp sư phạm</span>
            <span className="text-2xl font-bold text-error font-merriweather mt-1 block">3 bài</span>
            <span className="text-[11px] text-error font-semibold mt-1 block">Cần duyệt lại ảnh chụp</span>
          </div>
        </div>

        {/* Score Distribution Chart & Key Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart Left (7 cols) */}
          <div className="lg:col-span-7 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">bar_chart</span>
                Biểu đồ phân bố điểm số (Tổng n = 35 bài đã chấm)
              </span>
              <span className="text-[11px] text-on-surface-variant font-medium">Thang điểm 10</span>
            </div>

            {/* Custom high-fidelity bar chart representation */}
            <div className="space-y-3 pt-2">
              {MOCK_REPORT_METRICS.scoreDistribution.map((item, idx) => {
                const maxCount = 15;
                const percent = (item.count / maxCount) * 100;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-medium text-on-surface">
                        Khoảng {item.range} ({item.label})
                      </span>
                      <span className="font-bold text-secondary font-mono">
                        {item.count} bài ({((item.count / 35) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-6 w-full bg-surface-container-low rounded-lg overflow-hidden flex items-center px-2">
                      <div
                        className="h-4 bg-primary-container rounded transition-all flex items-center justify-end pr-2 text-[10px] font-bold text-on-primary-container"
                        style={{ width: `${Math.max(percent, 8)}%` }}
                      >
                        {item.count}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-on-surface-variant text-right">
              * Tổng số bài trong các khoảng: 2 + 15 + 9 + 7 + 2 = 35 bài.
            </p>
          </div>

          {/* Heatmap Criteria Right (5 cols) */}
          <div className="lg:col-span-5 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">grid_view</span>
                Điểm TB theo tiêu chí Rubric
              </span>
              <span className="text-[11px] text-on-surface-variant">Thang 10</span>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-on-surface">C1. Bố cục &amp; Cấu trúc</span>
                  <span className="text-[11px] text-on-surface-variant block">Đủ 3 phần Mở - Thân - Kết</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-tertiary font-mono">1.78 / 2.0</span>
                  <span className="text-[10px] text-tertiary block font-semibold">Tốt (89%)</span>
                </div>
              </div>

              <div className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-on-surface">C2. Luận điểm &amp; Dẫn chứng</span>
                  <span className="text-[11px] text-on-surface-variant block">Phản đề &amp; dẫn chứng thực tế</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-secondary font-mono">2.85 / 4.0</span>
                  <span className="text-[10px] text-secondary block font-semibold">Đạt (71%)</span>
                </div>
              </div>

              <div className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-on-surface">C3. Diễn đạt &amp; Chính tả</span>
                  <span className="text-[11px] text-on-surface-variant block">Ngữ pháp câu ghép phức</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-[#CA8A04] font-mono">1.55 / 2.0</span>
                  <span className="text-[10px] text-[#CA8A04] block font-semibold">Lưu ý (77%)</span>
                </div>
              </div>

              <div className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-on-surface">C4. Sáng tạo &amp; Cảm xúc</span>
                  <span className="text-[11px] text-on-surface-variant block">Cảm xúc cá nhân &amp; góc nhìn</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-primary font-mono">1.24 / 2.0</span>
                  <span className="text-[10px] text-primary block font-semibold">Khá (62%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pedagogical Action Plan Table (Mục tiêu ↔ Minh chứng ↔ Hành động) */}
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">psychology_alt</span>
                Kế hoạch điều chỉnh dạy học trước tiết tới (Pedagogical Action Plan)
              </h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Đối chiếu mục tiêu giáo án với điểm nghẽn thực tế phát hiện qua 35 bài chấm AI.
              </p>
            </div>
            <span className="text-xs bg-tertiary-container/30 text-tertiary font-bold px-2.5 py-0.5 rounded-full">
              Khuyến nghị AI
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 rounded-l-lg">Vấn đề phổ biến</th>
                  <th className="py-2.5 px-3">Tần suất học sinh mắc phải</th>
                  <th className="py-2.5 px-3">Ảnh hưởng Rubric</th>
                  <th className="py-2.5 px-3 rounded-r-lg">Hành động sư phạm cụ thể</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {MOCK_REPORT_METRICS.commonIssues.map((issue, idx) => (
                  <tr key={idx} className="hover:bg-surface-container-low/30">
                    <td className="py-3 px-3 font-semibold text-on-surface">{issue.issueType}</td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-error font-mono">{issue.percentage}</span>
                      <span className="text-on-surface-variant text-[11px] block">
                        ({issue.count}/{issue.total} bài)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-on-surface-variant">{issue.impact}</td>
                    <td className="py-3 px-3">
                      <div className="p-2 bg-surface-container-low rounded-lg border-l-2 border-secondary text-secondary font-medium leading-relaxed">
                        {issue.action}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Student Submissions List Table */}
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-outline-variant/20">
            <div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
                Danh sách bài nộp của học sinh (Lớp 12A1)
              </h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Bấm vào học sinh để xem chi tiết bài chép OCR và đối chiếu Rubric 4 tiêu chí.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Tìm tên hoặc mã HS..."
                className="px-3 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
              >
                <option value="all">Tất cả bài</option>
                <option value="graded">Đã chấm</option>
                <option value="pending">Chờ xử lý</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 rounded-l-lg">Họ và tên học sinh</th>
                  <th className="py-2.5 px-3">Mã định danh PII</th>
                  <th className="py-2.5 px-3">Điểm tổng (Thang 10)</th>
                  <th className="py-2.5 px-3">Trạng thái chấm</th>
                  <th className="py-2.5 px-3 rounded-r-lg text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredStudents.map((st) => (
                  <tr key={st.id} className="hover:bg-surface-container-low/40 transition-colors">
                    <td className="py-3 px-3 font-bold text-on-surface">{st.name}</td>
                    <td className="py-3 px-3 font-mono text-outline">{st.code}</td>
                    <td className="py-3 px-3">
                      {st.score !== null ? (
                        <span className="font-bold text-primary font-mono text-sm">{st.score.toFixed(1)} / 10.0</span>
                      ) : (
                        <span className="text-outline text-xs">--</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          st.score !== null
                            ? 'bg-tertiary-container/30 text-tertiary'
                            : 'bg-[#FEF9C3] text-[#CA8A04]'
                        }`}
                      >
                        {st.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {st.score !== null ? (
                        <Link
                          href={`/reports/assign-nlxh-01/students/${st.id}`}
                          className="px-3 py-1 bg-secondary text-white rounded text-xs font-semibold hover:bg-secondary/90 transition-all shadow-sm inline-flex items-center gap-1"
                        >
                          <span>Xem chi tiết chấm</span>
                          <span className="material-symbols-outlined text-xs">visibility</span>
                        </Link>
                      ) : (
                        <button
                          onClick={() => addToast('Bài làm đang trong hàng đợi xử lý khử nhiễu ảnh.', 'info')}
                          className="px-3 py-1 border border-outline-variant/50 text-xs text-on-surface-variant rounded hover:bg-surface-container"
                        >
                          Kiểm tra tiến độ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}

