'use client';

import React, { useState } from 'react';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  describedBy?: string;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder = 'Nhập mật khẩu...',
  error,
  describedBy,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      {label ? (
        <label htmlFor={id} className="block font-semibold text-slate-800 mb-1">
          {label}
        </label>
      ) : (
        <label htmlFor={id} className="sr-only">
          Mật khẩu
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={[errorId, describedBy].filter(Boolean).join(' ') || undefined}
          className="w-full px-3 py-2.5 pr-9 rounded-lg border border-outline-variant/60 bg-white/90 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 transition-all shadow-2xs"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            {visible ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-[11px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
