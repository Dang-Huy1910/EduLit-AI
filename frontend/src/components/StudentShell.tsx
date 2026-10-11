'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import ToastContainer from './ToastContainer';

interface StudentShellProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
}

export default function StudentShell({
  children,
  headerTitle = 'Khối 12 - Lớp 12A1',
  headerSubtitle = 'Bài viết số 1 — Nghị luận xã hội',
}: StudentShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, setRole, logout } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const studentNavItems = [
    { label: 'Bài tập của em', href: '/assignments', icon: 'edit_note' },
    { label: 'Bài đã nộp & Lịch sử chấm', href: '/assignments?tab=submitted', icon: 'task_alt' },
  ];

  const assistantNavItems = [
    {
      label: 'Trợ lý lập dàn ý Socratic',
      href: '/assignments/assign-nlxh-01/socratic',
      icon: 'psychology',
    },
    {
      label: 'Tra cứu ngữ liệu đọc hiểu',
      href: '/materials',
      icon: 'menu_book',
    },
  ];

  const handleSwitchToTeacher = () => {
    setRole('teacher');
    router.push('/assignments');
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      <ToastContainer />

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-surface-container-lowest border-b border-outline-variant/30 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-on-surface hover:bg-surface-container rounded-lg"
          >
            <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm">
              E
            </div>
            <span className="font-headline-sm text-headline-sm text-primary">EduLit-AI</span>
          </div>
        </div>
        <span className="font-caption text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-full text-xs font-semibold">
          {currentUser.name || 'Bùi Hà My'}
        </span>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col">
          {/* Brand Block */}
          <div className="h-16 px-space-lg flex items-center gap-space-sm border-b border-outline-variant/20">
            <div className="w-8 h-8 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-base shadow-sm">
              E
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-headline-sm text-headline-sm text-primary tracking-tight">EduLit-AI</span>
                <span className="text-[10px] bg-secondary-fixed/50 text-secondary font-bold px-1.5 py-0.2 rounded">
                  GDPT 2018
                </span>
              </div>
              <span className="font-caption text-caption text-on-surface-variant text-[11px]">
                Ngữ văn THPT Đan Phượng
              </span>
            </div>
          </div>

          {/* Student Nav */}
          <div className="px-space-md py-space-sm">
            <div className="px-space-sm pb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
              Góc học tập
            </div>
            <nav className="flex flex-col gap-space-xs mt-1">
              {studentNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-sm ${
                      isActive
                        ? 'bg-secondary-container text-on-secondary-container font-semibold shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Assistant Nav Group */}
          <div className="px-space-md pt-space-xs">
            <div className="my-space-sm h-[1px] bg-outline-variant/30"></div>
            <div className="px-space-sm pb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
              Trợ lý học tập AI
            </div>
            <nav className="flex flex-col gap-space-xs mt-1">
              {assistantNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-sm ${
                      isActive
                        ? 'bg-secondary-container text-on-secondary-container font-semibold shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] text-secondary">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Switch to Teacher link for prototype */}
          <div className="px-space-md pt-space-sm">
            <div className="my-space-sm h-[1px] bg-outline-variant/30"></div>
            <div className="px-space-sm pb-space-xs flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
                Xem trước vai trò
              </span>
              <span className="font-caption text-caption text-primary bg-primary-fixed px-space-xs py-0.5 rounded-full text-[10px] font-semibold">
                Demo
              </span>
            </div>
            <button
              onClick={handleSwitchToTeacher}
              className="w-full flex items-center gap-space-sm px-space-md py-space-sm rounded-lg text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-medium mt-1"
            >
              <span className="material-symbols-outlined text-[20px] text-primary">school</span>
              <span>Chuyển sang Giáo viên</span>
            </button>
          </div>
        </div>

        {/* Footer Card */}
        <div className="p-space-md bg-surface-container-low/60 m-space-md rounded-xl border border-outline-variant/20">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-secondary text-[22px]">verified_user</span>
            <div>
              <p className="font-label-md text-sm text-on-surface font-semibold">Mô hình Văn học AI</p>
              <p className="font-caption text-xs text-on-surface-variant">
                Chuẩn GDPT 2018 &amp; Bảo mật học sinh
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-72 flex flex-col min-h-screen">
        {/* Desktop Top Header */}
        <header className="hidden lg:flex fixed top-0 left-72 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 items-center justify-between px-space-lg border-b border-outline-variant/20">
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px] text-outline">assignment</span>
              <span>{headerTitle}</span>
              <span className="text-outline-variant">/</span>
              <span className="text-on-surface font-semibold">{headerSubtitle}</span>
            </div>
            <span className="font-caption text-xs text-secondary bg-secondary-fixed/50 px-space-sm py-0.5 rounded-full font-semibold">
              Chế độ xem thử: Học sinh
            </span>
          </div>

          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded-lg text-on-surface-variant font-caption text-xs">
              <span className="material-symbols-outlined text-[16px] text-tertiary">lock</span>
              <span>Mã hóa ẩn danh PII-Shield</span>
            </div>

            <div className="flex items-center gap-space-sm pl-space-md border-l border-outline-variant/40">
              <div className="text-right">
                <div className="font-label-md text-sm text-on-surface font-semibold">
                  {currentUser.name || 'Bùi Hà My'}
                </div>
                <div className="font-caption text-xs text-on-surface-variant">
                  Lớp 12A1 • THPT Đan Phượng
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs ring-2 ring-secondary-container/40">
                {currentUser.avatarInitials || 'HM'}
              </div>
              <button
                onClick={handleLogout}
                title="Đăng xuất"
                className="ml-2 p-1 text-on-surface-variant hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <main className="w-full pt-16 bg-surface min-h-screen px-4 lg:px-space-lg py-space-lg">
          {children}
        </main>
      </div>
    </div>
  );
}

