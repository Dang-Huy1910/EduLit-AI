'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';

export default function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-lg shadow-lg text-sm border transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            toast.type === 'success'
              ? 'bg-surface-container-lowest text-tertiary border-tertiary-container'
              : toast.type === 'error'
              ? 'bg-surface-container-lowest text-error border-error-container'
              : toast.type === 'warning'
              ? 'bg-surface-container-lowest text-[#CA8A04] border-[#FDE047]'
              : 'bg-surface-container-lowest text-on-surface border-outline-variant/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              {toast.type === 'success'
                ? 'check_circle'
                : toast.type === 'error'
                ? 'error'
                : toast.type === 'warning'
                ? 'warning'
                : 'info'}
            </span>
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-on-surface-variant hover:text-on-surface p-1"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}

