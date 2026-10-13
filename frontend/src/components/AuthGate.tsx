'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isApiMode } from '@/lib/data-mode';
import { useApiAuthStore } from '@/lib/api-auth-store';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useApiAuthStore((state) => state.status);
  const bootstrap = useApiAuthStore((state) => state.bootstrap);

  useEffect(() => {
    if (!isApiMode()) {
      return;
    }
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!isApiMode()) {
      return;
    }
    if (status === 'authenticated' && pathname === '/login') {
      router.replace('/assignments');
    }
    if (status === 'unauthenticated' && pathname !== '/login') {
      router.replace('/login');
    }
  }, [status, pathname, router]);

  if (!isApiMode()) {
    return <>{children}</>;
  }

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Đang kiểm tra phiên đăng nhập...</span>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' && pathname !== '/login') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <span className="text-sm text-on-surface-variant">Đang chuyển về trang đăng nhập...</span>
      </div>
    );
  }

  return <>{children}</>;
}
