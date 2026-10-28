'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[EduLit] Client error caught by boundary:', error);
  }, [error]);

  const handleResetStorage = () => {
    try {
      if (typeof window !== 'undefined') {
        // Older keys may still linger in browsers that used the prototype.
        const keys = [
          'edulit-app-v2',
          'edulit-app-v1',
          'edulit-demo-v3',
          'edulit-ai-storage',
        ];
        for (const k of keys) {
          try {
            sessionStorage.removeItem(k);
            localStorage.removeItem(k);
          } catch {}
        }
        window.location.href = '/assignments';
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center font-body-md text-on-surface">
      <div className="max-w-md w-full p-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-lg space-y-5">
        <div className="w-16 h-16 rounded-full bg-error-container/30 text-error flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-3xl">warning</span>
        </div>

        <div>
          <h2 className="text-xl font-bold font-merriweather text-on-surface mb-2">
            Đã xảy ra sự cố hiển thị
          </h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Hệ thống phát hiện xung đột trạng thái dữ liệu tạm trong trình duyệt. Bạn có thể bấm nút bên dưới để khôi phục dữ liệu demo sạch.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg border border-outline-variant hover:bg-surface-container transition-all"
          >
            Thử tải lại
          </button>
          <button
            onClick={handleResetStorage}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            <span>Khôi phục dữ liệu demo</span>
          </button>
        </div>

        <div className="pt-2">
          <Link
            href="/assignments"
            className="text-xs text-primary font-medium hover:underline"
          >
            &larr; Quay về trang Quản lý bài tập
          </Link>
        </div>
      </div>
    </div>
  );
}

