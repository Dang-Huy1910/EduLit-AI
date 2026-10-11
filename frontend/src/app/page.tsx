'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';

export default function RootPage() {
  const router = useRouter();
  const { currentUser } = useAppStore();

  useEffect(() => {
    if (currentUser) {
      router.replace('/assignments');
    } else {
      router.replace('/login');
    }
  }, [currentUser, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface">
      <div className="flex flex-col items-center gap-2 text-on-surface-variant">
        <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
        <span className="text-xs">Đang tải EduLit-AI...</span>
      </div>
    </div>
  );
}

