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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishLogin = async (user: ApiUser) => {
    addToast(`Đăng nhập thành công: ${user.displayName}.`, 'success');
    router.replace('/assignments');
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loginId.trim() || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
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
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/anh-truong.jpg')` }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-r from-slate-950/85 via-slate-900/55 to-slate-900/15 pointer-events-none" />
      <ToastContainer />
      <div className="relative z-10 w-full max-w-7xl mx-auto min-h-screen px-4 sm:px-8 py-8 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
        <div className="w-full lg:w-3/5 text-white space-y-6 pt-4 lg:pt-0">
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
          <div className="space-y-3 max-w-xl">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-merriweather leading-tight tracking-tight text-white drop-shadow-md">
              Tự lập dàn ý, nhận phản hồi, tiến bộ qua từng bài viết.
            </h1>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed drop-shadow">
              Dùng nút tài khoản demo để vào nhanh, hoặc nhập loginId và mật khẩu đã cấu hình trên máy chủ.
            </p>
          </div>
        </div>

        <div className="w-full lg:w-[420px] shrink-0 my-auto">
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] p-6 sm:p-8 border border-white/30 text-on-surface">
            <div className="mb-5">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight font-merriweather text-slate-900">
                CHÀO MỪNG <span className="text-error font-extrabold">TRỞ LẠI</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">Đăng nhập bằng loginId được cấp (ví dụ bui.hamy)</p>
            </div>
            {error && (
              <div className="mb-4 p-2.5 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error" data-testid="login-error">
                {error}
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">Tên đăng nhập</label>
                <input
                  data-testid="login-id"
                  type="text"
                  autoComplete="username"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  placeholder="bui.hamy"
                  className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-800">Mật khẩu</label>
                <div className="relative mt-1">
                  <input
                    data-testid="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Nhập mật khẩu đã cấu hình"
                    className="w-full px-3 py-2.5 pr-9 rounded-lg border border-yellow-200 bg-amber-50/50 text-slate-900 text-xs font-medium focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-2.5 text-slate-400">
                    <span className="material-symbols-outlined text-base">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <button
                data-testid="login-submit"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-secondary text-white font-bold text-xs hover:bg-secondary/90 transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {loading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
              </button>
            </form>
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Đăng nhập nhanh 1-click
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.loginId}
                    type="button"
                    data-testid={`demo-login-${account.loginId}`}
                    disabled={loading}
                    onClick={() => void handleDemoLogin(account)}
                    className="p-2 rounded-lg border border-slate-200 hover:border-secondary hover:bg-cyan-50/40 text-left transition-all disabled:opacity-50"
                  >
                    <div className="font-bold text-slate-800">{account.displayName}</div>
                    <div className="text-[10px] text-secondary font-medium">
                      {account.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'} · {account.loginId}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
