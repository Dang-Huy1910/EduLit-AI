'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiAuthStore } from '@/lib/api-auth-store';
import { ApiError, type ApiUser } from '@/lib/api/types';
import ToastContainer from '@/components/ToastContainer';
import { useAppStore } from '@/lib/store';

const DEMO_ACCOUNTS: Array<Pick<ApiUser, 'loginId' | 'displayName' | 'role'>> = [
  { loginId: 'dang.loan', displayName: 'Cô Đặng Loan', role: 'TEACHER' },
  { loginId: 'bui.hamy', displayName: 'Bùi Hà My', role: 'STUDENT' },
  { loginId: 'nguyen.an', displayName: 'Nguyễn An', role: 'STUDENT' },
  { loginId: 'tran.minhquan', displayName: 'Trần Minh Quân', role: 'STUDENT' },
];

export default function ApiLoginPage() {
  const router = useRouter();
  const login = useApiAuthStore((state) => state.login);
  const demoLogin = useApiAuthStore((state) => state.demoLogin);
  const addToast = useAppStore((state) => state.addToast);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishLogin = async (user: ApiUser) => {
    addToast(`Đăng nhập thành công: ${user.displayName}.`, 'success');
    router.replace('/assignments');
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loginId.trim() || !password) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const user = await login(loginId.trim(), password);
      await finishLogin(user);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không đăng nhập được. Vui lòng thử lại.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setLoading(true);
    setError(null);
    try {
      const user = await demoLogin(account.loginId);
      await finishLogin(user);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không đăng nhập nhanh được.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden font-body-md antialiased">
      {/* 1. Full-screen Sharp School Background Image */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/anh-truong.jpg')` }}
      />

      {/* 2. Left Translucent Overlay Gradient */}
      <div className="fixed inset-0 z-0 bg-gradient-to-r from-slate-950/85 via-slate-900/55 to-slate-900/15 pointer-events-none" />

      <ToastContainer />

      {/* Main Container: Split 2 Columns */}
      <div className="relative z-10 w-full max-w-7xl mx-auto min-h-screen px-4 sm:px-8 py-8 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
        {/* Left Column: Hero Brand & Motivational Message */}
        <div className="w-full lg:w-3/5 text-white space-y-6 pt-4 lg:pt-0">
          {/* Logo & Header Chip */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-lg font-bold">
              <span className="material-symbols-outlined text-2xl">auto_stories</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tracking-tight font-merriweather">EduLit-AI</span>
                <span className="text-[10px] bg-secondary-fixed/30 text-secondary-fixed border border-secondary-fixed/40 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  GDPT 2018
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">THPT Đan Phượng • Hà Nội</p>
            </div>
          </div>

          {/* Big Bold Hero Headline */}
          <div className="space-y-3 max-w-xl">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-merriweather leading-tight tracking-tight text-white drop-shadow-md">
              Tự lập dàn ý, nhận phản hồi, tiến bộ qua từng bài viết.
            </h1>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed drop-shadow">
              Nền tảng hỗ trợ dạy – học môn Ngữ văn THPT Đan Phượng theo định hướng phát triển phẩm chất và năng lực học sinh.
            </p>
          </div>

          {/* Quote Banner with Accent Line */}
          <div className="p-4 rounded-xl bg-slate-950/40 backdrop-blur-md border-l-4 border-primary max-w-lg">
            <p className="text-xs sm:text-sm italic font-merriweather text-slate-100 leading-relaxed">
              “Văn học là nhân học — giúp người học hiểu mình, thấu suốt con người và bồi đắp lòng trắc ẩn.”
            </p>
          </div>

          {/* Feature Badges */}
          <div className="hidden sm:flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-300 font-medium">
            <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
              <span className="material-symbols-outlined text-tertiary-container text-base">verified</span>
              <span>Chuẩn Barem Bộ GD&amp;ĐT</span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
              <span className="material-symbols-outlined text-secondary-fixed text-base">shield</span>
              <span>Bảo mật dữ liệu PII-Shield</span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
              <span className="material-symbols-outlined text-primary-container text-base">psychology</span>
              <span>Gợi mở Socratic AI</span>
            </div>
          </div>
        </div>

        {/* Right Column: Crisp White Floating Login Card */}
        <div className="w-full lg:w-[420px] shrink-0 my-auto">
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] p-6 sm:p-8 border border-white/30 text-on-surface">
            {/* Card Header */}
            <div className="mb-5">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight font-merriweather text-slate-900">
                CHÀO MỪNG <span className="text-error font-extrabold">TRỞ LẠI</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Đăng nhập bằng tài khoản được cấp để tiếp tục
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div
                className="mb-4 p-2.5 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error flex items-start gap-2"
                data-testid="login-error"
              >
                <span className="material-symbols-outlined text-base mt-0.5">error</span>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Email hoặc tên đăng nhập
                </label>
                <input
                  data-testid="login-id"
                  type="text"
                  autoComplete="username"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  placeholder="dang.loan hoặc bui.hamy"
                  className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-800">Mật khẩu</label>
                  <button
                    type="button"
                    onClick={() => addToast('Vui lòng liên hệ ban quản trị THPT Đan Phượng để cấp lại mật khẩu.', 'info')}
                    className="text-secondary hover:underline text-[11px]"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <input
                    data-testid="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2.5 pr-9 rounded-lg border border-yellow-200 bg-amber-50/50 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                  >
                    <span className="material-symbols-outlined text-base">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember checkbox */}
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                />
                <label htmlFor="remember" className="text-slate-600 text-xs cursor-pointer select-none">
                  Ghi nhớ đăng nhập của tôi
                </label>
              </div>

              {/* Submit CTA */}
              <button
                data-testid="login-submit"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-secondary text-white font-bold text-xs hover:bg-secondary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <>
                    <span>Đăng nhập hệ thống</span>
                    <span className="material-symbols-outlined text-base">&rarr;</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick 1-Click Demo Accounts */}
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Đăng nhập nhanh 1-Click:
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.loginId}
                    type="button"
                    data-testid={`demo-login-${account.loginId}`}
                    disabled={loading}
                    onClick={() => void handleDemoLogin(account)}
                    className={`p-2 rounded-lg border text-left transition-all disabled:opacity-50 ${
                      account.role === 'TEACHER'
                        ? 'border-slate-200 hover:border-primary hover:bg-amber-50/40'
                        : 'border-slate-200 hover:border-secondary hover:bg-cyan-50/40'
                    }`}
                  >
                    <div className="font-bold text-slate-800">{account.displayName}</div>
                    <div
                      className={`text-[10px] font-medium ${
                        account.role === 'TEACHER' ? 'text-primary' : 'text-secondary'
                      }`}
                    >
                      {account.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'} &rarr;
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Footer Links */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-secondary">
              <button
                type="button"
                onClick={() => addToast('Sử dụng tài khoản được đồng bộ từ CSDL ngành GD&ĐT.', 'info')}
                className="hover:underline uppercase tracking-wide"
              >
                Đăng nhập lần đầu?
              </button>
              <button
                type="button"
                onClick={() => addToast('Liên hệ hỗ trợ: support@thptdanphuong.edu.vn', 'info')}
                className="hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">mail</span>
                <span>Hỗ trợ</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
