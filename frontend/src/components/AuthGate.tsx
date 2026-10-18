'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { isSafeReturnTo } from '@/lib/auth-client';

const PUBLIC_AUTH_PATHS = new Set([
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
]);

function Spinner({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-on-surface-variant">
        <span className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user, errorMessage, initialize } = useAuthStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const isPublicAuth = PUBLIC_AUTH_PATHS.has(pathname);

  useEffect(() => {
    if (status !== 'authenticated' && status !== 'unauthenticated') return;
    if (status === 'authenticated' && (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password')) {
      const dest = user?.role === 'TEACHER' ? '/assignments' : '/assignments';
      router.replace(dest);
    }
    if (status === 'unauthenticated' && !isPublicAuth) {
      const returnTo = pathname !== '/' && isSafeReturnTo(pathname) ? `?returnTo=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${returnTo}`);
    }
  }, [status, pathname, isPublicAuth, router, user]);

  if (status === 'initializing') {
    return <Spinner label="Đang kiểm tra phiên đăng nhập..." />;
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <h1 className="text-lg font-bold font-merriweather">Không kết nối được máy chủ</h1>
          <p className="text-sm text-on-surface-variant" role="alert">
            {errorMessage || 'API xác thực tạm thời không phản hồi. Không thể đăng nhập giả.'}
          </p>
          <button
            type="button"
            onClick={() => void initialize()}
            className="w-full py-2.5 rounded-lg bg-secondary text-white text-sm font-semibold"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' && !isPublicAuth) {
    return <Spinner label="Đang chuyển tới trang đăng nhập..." />;
  }

  if (status === 'authenticated' && (pathname === '/login' || pathname === '/register')) {
    return <Spinner label="Đang mở không gian làm việc..." />;
  }

  const returnTo = searchParams.get('returnTo');
  if (status === 'authenticated' && isSafeReturnTo(returnTo) && pathname === '/login') {
    return <Spinner label="Đang mở trang trước đó..." />;
  }

  return <>{children}</>;
}
