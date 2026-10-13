'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import StudentShell from '@/components/StudentShell';
import { getOwnWritingProfile } from '@/lib/api/submissions';
import { ApiError, type ApiWritingProfile } from '@/lib/api/types';

const STATUS_LABEL: Record<string, string> = {
  PROVISIONAL: 'Nhận xét sơ bộ',
  SUPPORTED: 'Giáo viên xác nhận',
  RESOLVED: 'Đã tiến bộ',
  INVALIDATED: 'Không còn hiệu lực',
};

export default function ApiStudentProfileView() {
  const [data, setData] = useState<ApiWritingProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getOwnWritingProfile()
      .then((row) => {
        if (active) setData(row);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : 'Không tải được hồ sơ văn phong.');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <StudentShell headerTitle="Hồ sơ văn phong" headerSubtitle="Từ các bài đã được công bố">
      <main className="mx-auto max-w-4xl space-y-5" data-testid="student-profile">
        <header className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary">Không phải bước thứ sáu</p>
          <h1 className="mt-1 font-merriweather text-2xl font-bold">Hồ sơ văn phong của em</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Chỉ lấy từ bài đã công bố, có đoạn dẫn thật. Không có phần trăm “hiểu văn phong”.
          </p>
        </header>
        {error && (
          <div role="alert" className="rounded-lg border border-error/30 bg-error-container/40 p-4 text-sm text-error">
            {error}
          </div>
        )}
        {!data ? (
          <p className="text-sm text-on-surface-variant">Đang tải hồ sơ…</p>
        ) : data.observations.length === 0 ? (
          <section className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 p-8 text-center">
            <p className="font-semibold">Chưa có nhận xét văn phong</p>
            <p className="mt-1 text-sm text-on-surface-variant">Khi giáo viên công bố bài và trích xuất xong, nhận xét sẽ hiện ở đây.</p>
            <Link href="/assignments" className="mt-4 inline-block text-sm font-semibold text-primary">
              Về danh sách bài tập
            </Link>
          </section>
        ) : (
          <section className="space-y-3">
            {data.observations.map((item) => (
              <article key={item.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5" data-testid="profile-observation">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-secondary">{item.genre} · {item.kind}</span>
                  <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold">{STATUS_LABEL[item.status] ?? item.status}</span>
                </div>
                <p className="mt-2 text-sm leading-6">{item.description}</p>
                <blockquote data-testid="observation-quote" className="mt-3 border-l-2 border-secondary pl-3 text-sm italic text-on-surface-variant">
                  “{item.evidenceQuote}”
                </blockquote>
              </article>
            ))}
          </section>
        )}
      </main>
    </StudentShell>
  );
}
