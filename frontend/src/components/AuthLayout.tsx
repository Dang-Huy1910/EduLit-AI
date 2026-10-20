'use client';

import React from 'react';
import ToastContainer from './ToastContainer';
import EduLitMark from './EduLitMark';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const FEATURES = [
  { icon: 'psychology', title: 'Gợi mở, không viết hộ', body: 'Trợ lý Socratic đặt câu hỏi để em tự lập dàn ý.' },
  { icon: 'fact_check', title: 'Chấm theo barem', body: 'Kết quả chỉ hiện khi giáo viên đã duyệt và công bố.' },
  { icon: 'fingerprint', title: 'Hồ sơ văn phong', body: 'Nhận xét có trích dẫn từ chính bài viết của em.' },
] as const;

function BrandMark() {
  return (
    <div className="w-12 h-12 rounded-xl bg-white/15 text-amber-200 ring-1 ring-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
      <EduLitMark className="w-8 h-8" />
    </div>
  );
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#f7f3ec] font-body-md antialiased text-on-surface lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ToastContainer />

      {/* Visual panel: school photo with brand and mission */}
      <aside className="relative m-2.5 sm:m-3 lg:mr-0 overflow-hidden rounded-[24px] lg:rounded-[30px] h-56 sm:h-64 lg:h-[calc(100vh-1.5rem)] lg:sticky lg:top-3 text-white isolate">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/anh-truong.jpg"
          alt="Cổng trường THPT Đan Phượng"
          className="absolute inset-0 -z-20 w-full h-full object-cover object-[50%_62%] scale-105"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#06222b] via-[#06222b]/70 to-[#06222b]/30" />
        <div className="absolute inset-x-0 top-0 h-48 -z-10 bg-gradient-to-b from-[#06222b]/70 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#006780]/35 via-transparent to-amber-900/30 mix-blend-multiply" />
        <div className="absolute -bottom-24 -left-16 -z-10 w-[420px] h-[420px] rounded-full bg-amber-400/15 blur-3xl" />

        <div className="relative h-full flex flex-col justify-between p-5 sm:p-8 lg:p-12">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div className="min-w-0">
              <p className="font-merriweather font-black text-xl sm:text-2xl tracking-tight leading-none">EduLit-AI</p>
              <p className="mt-1.5 text-[11px] sm:text-xs text-white/75 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Ngữ văn • Trường THPT Đan Phượng, Hà Nội
              </p>
            </div>
          </div>

          <div className="space-y-6 lg:space-y-7 max-w-2xl">
            <div className="space-y-3 lg:space-y-4">
              <p className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-md text-[11px] font-semibold tracking-wide uppercase text-amber-100">
                <span className="material-symbols-outlined text-sm">school</span>
                Học và dạy Ngữ văn theo GDPT 2018
              </p>
              <h1 className="font-merriweather font-bold tracking-tight text-[24px] leading-[1.25] sm:text-4xl lg:text-[34px] xl:text-[40px] lg:leading-[1.2] [text-wrap:balance] drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                <span className="lg:block">Tự lập dàn ý, nhận phản hồi,</span>{' '}
                <span className="lg:block bg-gradient-to-r from-amber-200 via-amber-100 to-white bg-clip-text text-transparent">
                  tiến bộ qua từng bài viết.
                </span>
              </h1>
              <p className="hidden lg:block lg:[@media(max-height:760px)]:hidden text-base text-white/80 leading-relaxed max-w-lg">
                Không gian chung cho học sinh và thầy cô: lập dàn ý, nộp bài viết tay, xem nhận xét có căn cứ và theo
                dõi sự tiến bộ qua từng bài.
              </p>
            </div>

            <ul className="hidden lg:grid grid-cols-3 gap-3">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="p-4 rounded-2xl bg-white/[0.08] ring-1 ring-white/15 backdrop-blur-md">
                  <span className="w-9 h-9 rounded-xl bg-white/15 text-amber-200 flex items-center justify-center mb-3">
                    <span className="material-symbols-outlined text-xl">{feature.icon}</span>
                  </span>
                  <p className="text-sm font-semibold leading-snug">{feature.title}</p>
                  <p className="mt-1 text-xs text-white/70 leading-relaxed">{feature.body}</p>
                </li>
              ))}
            </ul>

            <figure className="hidden lg:flex lg:[@media(max-height:860px)]:hidden items-start gap-3 pt-6 border-t border-white/15">
              <span className="font-merriweather text-4xl leading-none text-amber-300/80 -mt-1" aria-hidden="true">
                “
              </span>
              <blockquote className="font-merriweather italic text-sm text-white/85 leading-relaxed">
                Văn học là nhân học — giúp người học hiểu mình, thấu suốt con người và bồi đắp lòng trắc ẩn.
              </blockquote>
            </figure>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-col lg:min-h-screen">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#d9cdbb_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
        />
        <div className="relative flex-1 flex items-center justify-center px-5 sm:px-10 py-8 lg:py-12">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
        <footer className="relative px-5 sm:px-10 pb-6 text-center text-[11px] text-[#8a7c69]">
          © 2026 Trường THPT Đan Phượng • Nền tảng Ngữ văn EduLit-AI
        </footer>
      </main>
    </div>
  );
}
