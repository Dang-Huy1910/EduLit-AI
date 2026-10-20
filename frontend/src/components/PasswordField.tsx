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
  /** "lg" is the roomy field used on the login screen. */
  size?: 'md' | 'lg';
  leadingIcon?: string;
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
  size = 'md',
  leadingIcon,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const errorId = error ? `${id}-error` : undefined;
  const capsId = capsLock ? `${id}-caps` : undefined;
  const large = size === 'lg';
  const detectCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);

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
        {leadingIcon && (
          <span
            className={`material-symbols-outlined pointer-events-none absolute top-1/2 -translate-y-1/2 text-[#9a8b77] ${
              large ? 'left-3.5 text-xl' : 'left-2.5 text-base'
            }`}
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        )}
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={detectCaps}
          onKeyUp={detectCaps}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={[errorId, capsId, describedBy].filter(Boolean).join(' ') || undefined}
          className={
            large
              ? `w-full h-12 ${leadingIcon ? 'pl-11' : 'pl-4'} pr-12 rounded-xl border border-[#e2d8ca] bg-white text-slate-900 text-sm placeholder:text-[#a99b88] focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all shadow-[0_1px_2px_rgba(60,40,10,0.04)]`
              : `w-full px-3 py-2.5 pr-9 ${leadingIcon ? 'pl-8' : ''} rounded-lg border border-outline-variant/60 bg-white/90 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 transition-all shadow-2xs`
          }
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className={
            large
              ? 'absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[#9a8b77] hover:text-slate-700 hover:bg-[#f3ede3] transition-colors'
              : 'absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700'
          }
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
        >
          <span className={`material-symbols-outlined ${large ? 'text-xl' : 'text-base'}`} aria-hidden="true">
            {visible ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {capsLock && (
        <p id={capsId} className="mt-1.5 text-[11px] font-medium text-amber-700 flex items-center gap-1">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            keyboard_capslock
          </span>
          Caps Lock đang bật
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-[11px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
