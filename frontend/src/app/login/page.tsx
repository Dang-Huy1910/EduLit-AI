'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { MOCK_TEACHER, MOCK_STUDENT } from '@/lib/mock/data';
import ToastContainer from '@/components/ToastContainer';

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setRole, addToast, resetDemoState } = useAppStore();

  const [username, setUsername] = useState('dang.loan@thptdanphuong.edu.vn');
  const [password, setPassword] = useState('DanPhuong@2024');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [simState, setSimState] = useState<'normal' | 'error' | 'maintenance'>('normal');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (simState === 'maintenance') {
      addToast('Hệ thống đang bảo trì đồng bộ học liệu theo CSDL Bộ GD&ĐT.', 'warning');
      return;
    }

    if (simState === 'error') {
      addToast('Mã định danh hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.', 'error');
      return;
    }

    if (!username.trim() || !password.trim()) {
      addToast('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.', 'warning');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (username.includes('loan') || username.includes('dangloan') || username.includes('gv') || username.includes('teacher')) {
        setUser(MOCK_TEACHER);
        setRole('teacher');
        addToast('Đăng nhập thành công với vai trò Giáo viên.', 'success');
        router.push('/assignments');
      } else {
        setUser(MOCK_STUDENT);
        setRole('student');
        addToast('Đăng nhập thành công với vai trò Học sinh.', 'success');
        router.push('/assignments');
      }
    }, 700);
  };

  const handleQuickLoginTeacher = () => {
    setUser(MOCK_TEACHER);
    setRole('teacher');
    addToast('Đăng nhập nhanh: Cô Đặng Loan (Giáo viên)', 'success');
    router.push('/assignments');
  };

  const handleQuickLoginStudent = () => {
    setUser(MOCK_STUDENT);
    setRole('student');
    addToast('Đăng nhập nhanh: Bùi Hà My (Học sinh)', 'success');
    router.push('/assignments');
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden font-body-md antialiased">
      {/* 1. Full-screen Sharp School Background Image */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{
          backgroundImage: `url('/anh-truong.jpg')`,
        }}
      />

      {/* 2. Left Translucent Overlay Gradient (Exactly like VLearn reference) */}
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



            {/* Alerts */}
            {simState === 'error' && (
              <div className="mb-4 p-2.5 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error flex items-start gap-2">
                <span className="material-symbols-outlined text-base mt-0.5">error</span>
                <span>Mã định danh hoặc mật khẩu không chính xác.</span>
              </div>
            )}
            {simState === 'maintenance' && (
              <div className="mb-4 p-2.5 bg-[#FEF9C3] border border-[#FDE047] rounded-lg text-xs text-[#CA8A04] flex items-start gap-2">
                <span className="material-symbols-outlined text-base mt-0.5">warning</span>
                <span>Hệ thống đang bảo trì đồng bộ học liệu GDPT 2018.</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Email đăng nhập
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="dang.loan@thptdanphuong.edu.vn"
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
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  Ghi nhớ email của tôi
                </label>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loading || simState === 'maintenance'}
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

            {/* Quick Role Selection */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleQuickLoginTeacher}
                className="px-2.5 py-1 rounded-md border border-slate-200/90 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-900 transition-all text-[11px] font-medium flex items-center gap-1.5 shadow-2xs"
                title="Đăng nhập vai trò Giáo viên (Cô Đặng Loan)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span>GV: Cô Loan</span>
              </button>
              <button
                type="button"
                onClick={handleQuickLoginStudent}
                className="px-2.5 py-1 rounded-md border border-slate-200/90 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-slate-700 hover:text-sky-900 transition-all text-[11px] font-medium flex items-center gap-1.5 shadow-2xs"
                title="Đăng nhập vai trò Học sinh (Bùi Hà My)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"></span>
                <span>HS: Hà My</span>
              </button>
            </div>

            {/* Bottom Footer Links */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-secondary">
              <button
                onClick={() => addToast('Sử dụng tài khoản được đồng bộ từ CSDL ngành GD&ĐT.', 'info')}
                className="hover:underline uppercase tracking-wide"
              >
                Đăng nhập lần đầu?
              </button>
              <button
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
