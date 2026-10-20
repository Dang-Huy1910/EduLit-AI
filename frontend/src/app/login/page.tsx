'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import PasswordField from '@/components/PasswordField';
import { AuthApiError } from '@/lib/auth-types';
import { authClient, isSafeReturnTo } from '@/lib/auth-client';
import { useAuthStore } from '@/lib/auth-store';
import { useAppStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const addToast = useAppStore((s) => s.addToast);

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    if (!loginId.trim() || !password) {
      setFormError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.login({
        loginId: loginId.trim(),
        password,
        rememberMe,
      });
      setAuthenticated(result.user);
      addToast('Đăng nhập thành công.', 'success');
      const returnTo = searchParams.get('returnTo');
      router.push(isSafeReturnTo(returnTo) ? returnTo : '/assignments');
    } catch (err) {
      if (err instanceof AuthApiError) {
        setFormError(err.message);
      } else {
        setFormError('Không kết nối được máy chủ. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="glass-panel rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] p-6 sm:p-8 border border-white/60 text-on-surface">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-secondary-fixed/50 border border-secondary/20 px-2.5 py-0.5 rounded-full">
              Cổng xác thực GDPT 2018
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight font-merriweather text-slate-900">
            CHÀO MỪNG <span className="text-primary font-extrabold">TRỞ LẠI</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Đăng nhập để vào không gian học tập và giảng dạy Ngữ văn.
          </p>
        </div>

        {formError && (
          <div className="mb-4 p-2.5 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error flex items-start gap-2" role="alert" aria-live="polite">
            <span className="material-symbols-outlined text-base mt-0.5">error</span>
            <span>{formError}</span>
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label htmlFor="loginId" className="block font-semibold text-slate-800 mb-1">
              Tên đăng nhập hoặc email
            </label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              placeholder="Tên đăng nhập hoặc email trường cấp"
              className="w-full px-3 py-2.5 rounded-lg border border-outline-variant/60 bg-white/90 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 transition-all shadow-2xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Mật khẩu</span>
              <Link href="/forgot-password" className="text-secondary hover:underline text-[11px] font-medium">
                Quên mật khẩu?
              </Link>
            </div>
            <PasswordField
              id="password"
              label=""
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu..."
            />
          </div>

          <div className="flex items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
            />
            <label htmlFor="remember" className="text-slate-600 text-xs cursor-pointer select-none">
              Ghi nhớ đăng nhập trên thiết bị này
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-secondary text-white font-bold text-xs hover:bg-secondary/90 hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang xác thực...</span>
              </>
            ) : (
              <>
                <span>Đăng nhập hệ thống</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200/60 text-[11px] text-slate-600 space-y-2">
          <div className="flex items-center justify-between">
            <span>Chưa có tài khoản học sinh?</span>
            <Link href="/register" className="text-secondary font-bold hover:underline">
              Đăng ký ngay &rarr;
            </Link>
          </div>
          <p className="text-slate-500">
            Giáo viên không cần đăng ký — sử dụng tài khoản được nhà trường phân quyền.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
