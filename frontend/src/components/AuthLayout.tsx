'use client';

import React from 'react';
import ToastContainer from './ToastContainer';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden font-body-md antialiased">
      {/* 1. Full-screen School Campus Background Image */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/anh-truong.jpg')` }}
      />

      {/* 2. Directional Vignette Gradient Overlay */}
      <div className="fixed inset-0 z-0 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-slate-950/40 lg:to-slate-950/25 pointer-events-none" />

      {/* 3. Subtle Ambient Light Source */}
      <div className="fixed top-1/4 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 left-1/3 w-80 h-80 bg-secondary/15 rounded-full blur-3xl pointer-events-none" />

      <ToastContainer />

      {/* Main Split Layout Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto min-h-screen px-4 sm:px-8 py-8 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
        {/* Left Column: Hero Brand, Pedagogy Mission & Feature Pillars */}
        <div className="w-full lg:w-3/5 text-white space-y-6 pt-4 lg:pt-0">
          {/* Logo & School Badge */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(217,119,6,0.35)] ring-1 ring-white/20">
              <span className="material-symbols-outlined text-2xl">auto_stories</span>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl sm:text-3xl font-black tracking-tight font-merriweather text-white drop-shadow">
                  EduLit-AI
                </span>
                <span className="text-[10px] bg-secondary-fixed/25 text-secondary-fixed border border-secondary-fixed/40 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-xs">
                  GDPT 2018
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Trường THPT Đan Phượng • Hà Nội
              </p>
            </div>
          </div>

          {/* Hero Headline & Subtitle */}
          <div className="hidden lg:block space-y-3 max-w-xl">
            <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-bold font-merriweather leading-[1.25] tracking-tight text-white drop-shadow-md">
              Tự lập dàn ý, nhận phản hồi,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-100 to-white">
                tiến bộ qua từng bài viết.
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed drop-shadow">
              Nền tảng hỗ trợ dạy – học môn Ngữ văn THPT Đan Phượng theo định hướng phát triển phẩm chất và năng lực học sinh.
            </p>
          </div>

          {/* Inspirational Pedagogical Quote Banner */}
          <div className="hidden lg:block p-3.5 sm:p-4 rounded-xl bg-slate-950/45 backdrop-blur-md border-l-4 border-amber-400 ring-1 ring-white/10 max-w-xl shadow-lg">
            <p className="text-xs sm:text-sm italic font-merriweather text-slate-100 leading-relaxed">
              “Văn học là nhân học — giúp người học hiểu mình, thấu suốt con người và bồi đắp lòng trắc ẩn.”
            </p>
          </div>

          {/* 3 Pedagogy Feature Pillar Cards */}
          <div className="hidden lg:grid grid-cols-3 gap-3 pt-1 max-w-2xl">
            {/* Pillar 1: Socratic */}
            <div className="group rounded-xl p-3.5 bg-slate-950/45 hover:bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-amber-400/30 transition-all duration-300 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-400/30 shrink-0">
                    <span className="material-symbols-outlined text-lg">psychology</span>
                  </div>
                  <span className="text-xs font-bold text-white tracking-tight">Socratic AI</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  Gợi mở tư duy phản biện, định hướng lập dàn ý, cam kết không viết bài hộ.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1 text-[10px] text-amber-300/80 font-semibold">
                <span>Khơi mở tư duy</span>
                <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
              </div>
            </div>

            {/* Pillar 2: Rubric */}
            <div className="group rounded-xl p-3.5 bg-slate-950/45 hover:bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-cyan-400/30 transition-all duration-300 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-400/30 shrink-0">
                    <span className="material-symbols-outlined text-lg">fact_check</span>
                  </div>
                  <span className="text-xs font-bold text-white tracking-tight">Rubric 4.0</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  Thang điểm minh bạch, thẩm định chuẩn 4 chiều năng lực Đọc &amp; Viết.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1 text-[10px] text-cyan-300/80 font-semibold">
                <span>Chuẩn GDPT 2018</span>
                <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
              </div>
            </div>

            {/* Pillar 3: Security & Academic Integrity */}
            <div className="group rounded-xl p-3.5 bg-slate-950/45 hover:bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-emerald-400/30 transition-all duration-300 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-400/30 shrink-0">
                    <span className="material-symbols-outlined text-lg">shield_lock</span>
                  </div>
                  <span className="text-xs font-bold text-white tracking-tight">Bảo mật PII</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  Ẩn danh dữ liệu học sinh THPT Đan Phượng, giữ gìn liêm chính học thuật.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1 text-[10px] text-emerald-300/80 font-semibold">
                <span>Liêm chính học đường</span>
                <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
              </div>
            </div>
          </div>

          {/* Trust Footer */}
          <div className="hidden lg:flex pt-2 items-center gap-2 text-xs text-slate-400">
            <span className="material-symbols-outlined text-base text-emerald-400">verified</span>
            <span>Hệ thống chuyển đổi số Ngữ văn chính thức • THPT Đan Phượng</span>
          </div>
        </div>

        {/* Right Column: Form Container */}
        <div className="w-full max-w-md lg:w-[420px] shrink-0 my-auto">{children}</div>
      </div>
    </div>
  );
}
