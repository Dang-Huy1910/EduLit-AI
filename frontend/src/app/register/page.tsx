'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import PasswordField from '@/components/PasswordField';
import { AuthApiError } from '@/lib/auth-types';
import { authClient } from '@/lib/auth-client';
import { useAuthStore } from '@/lib/auth-store';
import { useAppStore } from '@/lib/store';

export default function RegisterPage() {
  const router = useRouter();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const addToast = useAppStore((s) => s.addToast);
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    const fields: Record<string, string> = {};
    if (loginId.trim().length < 3) fields.loginId = 'Tên đăng nhập 3–64 ký tự.';
    if (!email.includes('@')) fields.email = 'Email không hợp lệ.';
    if (displayName.trim().length < 2) fields.displayName = 'Họ tên phải từ 2 ký tự.';
    if (password.length < 6) fields.password = 'Mật khẩu mới phải từ 6 đến 128 ký tự.';
    if (password !== confirm) fields.confirm = 'Nhập lại mật khẩu chưa khớp.';
    setFieldErrors(fields);
    if (Object.keys(fields).length) return;

    setLoading(true);
    try {
      const res = await authClient.register({
        loginId: loginId.trim(),
        email: email.trim(),
        displayName: displayName.trim(),
        password,
      });
      setAuthenticated(res.user);
      addToast(res.message || 'Đăng ký thành công.', 'success');
      router.push('/assignments');
    } catch (err) {
      if (err instanceof AuthApiError) {
        setFormError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setFormError('Không kết nối được máy chủ. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="text-on-surface">
        <div className="mb-5">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight font-merriweather text-slate-900">
            Đăng ký học sinh
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tài khoản mới luôn là học sinh. Đăng ký xong em vào học ngay, không cần xác minh email.
          </p>
        </div>
        {formError && (
          <div className="mb-4 p-2.5 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error" role="alert" aria-live="polite">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label htmlFor="displayName" className="block font-semibold text-slate-800 mb-1">
              Họ và tên
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            {fieldErrors.displayName && <p className="text-[11px] text-error mt-1">{fieldErrors.displayName}</p>}
          </div>
          <div>
            <label htmlFor="loginId" className="block font-semibold text-slate-800 mb-1">
              Tên đăng nhập
            </label>
            <input
              id="loginId"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            {fieldErrors.loginId && <p className="text-[11px] text-error mt-1">{fieldErrors.loginId}</p>}
          </div>
          <div>
            <label htmlFor="email" className="block font-semibold text-slate-800 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            {fieldErrors.email && <p className="text-[11px] text-error mt-1">{fieldErrors.email}</p>}
          </div>
          <PasswordField
            id="password"
            label="Mật khẩu (từ 6 ký tự)"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <PasswordField
            id="confirm"
            label="Nhập lại mật khẩu"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={fieldErrors.confirm}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-secondary text-white font-bold text-xs hover:bg-secondary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
          >
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản học sinh'}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-slate-600">
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-secondary font-semibold hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
