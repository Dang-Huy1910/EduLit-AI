'use client';

import React from 'react';
import ToastContainer from './ToastContainer';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
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
              Nền tảng hỗ trợ dạy – học môn Ngữ văn THPT Đan Phượng theo định hướng phát triển phẩm chất và năng lực học sinh.
            </p>
          </div>
        </div>
        <div className="w-full lg:w-[420px] shrink-0 my-auto">{children}</div>
      </div>
    </div>
  );
}
