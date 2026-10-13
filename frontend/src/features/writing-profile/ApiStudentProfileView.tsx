'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import StudentShell from '@/components/StudentShell';
import { getOwnWritingProfile } from '@/lib/api/submissions';
import { ApiError, type ApiWritingProfile } from '@/lib/api/types';

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  PROVISIONAL: {
    label: 'Nhận xét sơ bộ',
    badgeClass: 'bg-[#FEF9C3] text-[#CA8A04] border border-[#FDE047]/60',
  },
  SUPPORTED: {
    label: 'Giáo viên đã xác nhận',
    badgeClass: 'bg-tertiary-container/40 text-tertiary border border-tertiary/30',
  },
  RESOLVED: {
    label: 'Đã có tiến bộ',
    badgeClass: 'bg-secondary-fixed/50 text-secondary border border-secondary/30',
  },
  INVALIDATED: {
    label: 'Không còn hiệu lực',
    badgeClass: 'bg-surface-container text-on-surface-variant border border-outline-variant/30',
  },
};

const KIND_LABEL: Record<string, string> = {
  STRENGTH: 'Điểm sáng năng lực',
  WEAKNESS: 'Điểm cần rèn luyện',
  STYLE: 'Đặc trưng văn phong',
};

export default function ApiStudentProfileView() {
  const [data, setData] = useState<ApiWritingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getOwnWritingProfile()
      .then((row) => {
        if (active) setData(row);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : 'Không tải được hồ sơ văn phong.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const observations = data?.observations ?? [];
  const supportedCount = observations.filter((o) => o.status === 'SUPPORTED').length;
  const resolvedCount = observations.filter((o) => o.status === 'RESOLVED').length;

  return (
    <StudentShell headerTitle="Không gian học sinh" headerSubtitle="Hồ sơ năng lực &amp; Văn phong cá nhân">
      <main className="max-w-7xl mx-auto space-y-6" data-testid="student-profile">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Hồ sơ năng lực viết &amp; Văn phong cá nhân
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                Cập nhật theo chu trình GDPT 2018
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              Hồ sơ văn phong &amp; Theo dõi tiến bộ cá nhân
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Tổng hợp nhận xét chi tiết và minh chứng từ các bài viết đã được giáo viên bộ môn thẩm định chính thức.
            </p>
          </div>

          <Link
            href="/assignments"
            className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Về bài tập của em</span>
          </Link>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Tổng nhận xét văn phong</span>
              <div className="text-2xl font-bold text-on-surface font-merriweather mt-0.5">
                {observations.length}
              </div>
              <span className="text-[11px] text-outline font-semibold">Trích xuất từ các bài đã chấm</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">auto_stories</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Giáo viên đã xác nhận</span>
              <div className="text-2xl font-bold text-tertiary font-merriweather mt-0.5">
                {supportedCount}
              </div>
              <span className="text-[11px] text-tertiary font-semibold">Nhận xét có giá trị sư phạm</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-tertiary-container/30 text-tertiary flex items-center justify-center font-bold text-xs">
              <span className="material-symbols-outlined">verified</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Nội dung đã tiến bộ</span>
              <div className="text-2xl font-bold text-secondary font-merriweather mt-0.5">
                {resolvedCount}
              </div>
              <span className="text-[11px] text-secondary font-semibold">Đã khắc phục qua bài viết mới</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-secondary-fixed/50 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined">trending_up</span>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-error/30 bg-error-container/40 p-4 text-xs text-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant/30">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Đang tải hồ sơ văn phong...</span>
          </div>
        ) : observations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-lowest p-12 text-center shadow-sm space-y-3">
            <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto">
              <span className="material-symbols-outlined text-3xl">history_edu</span>
            </div>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">Chưa có nhận xét văn phong nào</h3>
            <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
              Khi các bài viết của em được giáo viên chấm và công bố kết quả, các nhận xét chi tiết về văn phong, lập luận và diễn đạt sẽ được tổng hợp tự động tại đây.
            </p>
            <div className="pt-2">
              <Link
                href="/assignments"
                className="inline-flex items-center gap-1 px-4 py-2 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg hover:brightness-95 transition-all shadow-sm"
              >
                <span>Xem danh sách bài tập</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </div>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
                Danh sách nhận xét &amp; Minh chứng trích dẫn ({observations.length})
              </h2>
              <span className="text-xs text-on-surface-variant">Bấm vào nhận xét để xem chi tiết trích dẫn</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {observations.map((item) => {
                const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.PROVISIONAL;
                return (
                  <article
                    key={item.id}
                    className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm space-y-3 flex flex-col justify-between"
                    data-testid="profile-observation"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/20">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-surface-container px-2 py-0.5 rounded">
                            {item.genre}
                          </span>
                          <span className="text-xs font-semibold text-on-surface">
                            {KIND_LABEL[item.kind] || item.kind}
                          </span>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </div>

                      <p className="mt-2 text-xs sm:text-sm leading-relaxed text-on-surface font-medium">
                        {item.description}
                      </p>

                      <blockquote
                        data-testid="observation-quote"
                        className="mt-3 p-3 rounded-lg border-l-4 border-secondary bg-surface-container-low/50 text-xs italic font-merriweather text-on-surface-variant leading-relaxed"
                      >
                        “{item.evidenceQuote}”
                      </blockquote>
                    </div>

                    <div className="pt-2 text-[11px] text-outline flex items-center justify-between">
                      <span>Mã nhận xét: {item.id.slice(0, 8)}</span>
                      <span className="font-semibold text-secondary">Hồ sơ GDPT 2018</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </StudentShell>
  );
}
