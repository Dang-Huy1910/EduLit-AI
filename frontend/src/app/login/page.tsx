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
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">
            <span className="w-5 h-px bg-secondary/60" aria-hidden="true" />
            Đăng nhập
          </p>
          <h2 className="font-merriweather text-[28px] sm:text-[32px] font-bold tracking-tight text-[#1c1a17] leading-tight">
            Chào mừng trở lại
          </h2>
          <p className="text-sm text-[#6f6352] leading-relaxed">
            Tiếp tục hành trình học và dạy Ngữ văn cùng EduLit-AI.
          </p>
        </header>

        {formError && (
          <div
            className="p-3 rounded-xl bg-[#fdecea] border border-error/25 text-sm text-[#8c1d18] flex items-start gap-2.5"
            role="alert"
            aria-live="polite"
          >
            <span className="material-symbols-outlined text-lg text-error shrink-0" aria-hidden="true">
              error
            </span>
            <span className="leading-relaxed">{formError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="loginId" className="block text-sm font-semibold text-[#2d2a25]">
              Tên đăng nhập hoặc email
            </label>
            <div className="relative">
              <span
                className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xl text-[#9a8b77]"
                aria-hidden="true"
              >
                person
              </span>
              <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder="vd. nguyen.van.an"
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-[#e2d8ca] bg-white text-slate-900 text-sm placeholder:text-[#a99b88] focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all shadow-[0_1px_2px_rgba(60,40,10,0.04)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-semibold text-[#2d2a25]">
                Mật khẩu
              </label>
              <Link href="/forgot-password" className="text-xs font-semibold text-secondary hover:underline underline-offset-2">
                Quên mật khẩu?
              </Link>
            </div>
            <PasswordField
              id="password"
              label=""
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              size="lg"
              leadingIcon="lock"
            />
          </div>

          <label htmlFor="remember" className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-[18px] h-[18px] accent-secondary cursor-pointer"
            />
            <span className="text-sm text-[#5d5244]">Ghi nhớ đăng nhập trên thiết bị này</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="group w-full h-12 rounded-xl bg-gradient-to-r from-[#00586d] via-secondary to-[#0a7a8f] text-white text-sm font-semibold tracking-wide shadow-[0_12px_28px_-10px_rgba(0,103,128,0.65)] hover:shadow-[0_16px_34px_-10px_rgba(0,103,128,0.75)] hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/90 border-t-transparent rounded-full animate-spin" />
                <span>Đang đăng nhập...</span>
              </>
            ) : (
              <>
                <span>Đăng nhập</span>
                <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </form>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-[#a99b88]">
            <span className="h-px flex-1 bg-[#e6dccd]" />
            Lần đầu dùng EduLit?
            <span className="h-px flex-1 bg-[#e6dccd]" />
          </div>
          <Link
            href="/register"
            className="w-full h-12 rounded-xl border border-[#dccfbd] bg-white/70 hover:bg-white hover:border-secondary/40 text-sm font-semibold text-[#2d2a25] transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg text-secondary" aria-hidden="true">
              person_add
            </span>
            Tạo tài khoản học sinh
          </Link>
          <p className="flex items-start gap-2 text-xs text-[#7d705e] leading-relaxed">
            <span className="material-symbols-outlined text-base text-[#a99b88] shrink-0" aria-hidden="true">
              badge
            </span>
            Giáo viên không cần đăng ký — dùng tài khoản được nhà trường cấp.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
