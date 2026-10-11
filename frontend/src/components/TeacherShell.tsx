'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import ToastContainer from './ToastContainer';

interface TeacherShellProps {
  children: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export default function TeacherShell({ children, breadcrumb }: TeacherShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, setRole, logout } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Bài tập & Đề kiểm tra', href: '/assignments', icon: 'assignment' },
    { label: 'Kho ngữ liệu & Chuyên đề', href: '/materials', icon: 'menu_book' },
    { label: 'Báo cáo năng lực lớp', href: '/reports', icon: 'analytics' },
    { label: 'Trợ lý chấm & Rubric', href: '/assignments/assign-nlxh-01', icon: 'auto_awesome' },
  ];

  const handleSwitchToStudent = (targetHref: string) => {
    setRole('student');
    router.push(targetHref);
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
            <span className="material-symbols-outlined text-primary text-2xl">auto_stories</span>
            <span className="font-headline-sm text-headline-sm text-primary">EduLit-AI</span>
          </div>
        </div>
        <span className="font-caption text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-full text-xs">
          Giáo viên
        </span>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col">
          {/* Logo Brand Header */}
          <div className="h-16 px-space-lg flex items-center gap-space-sm border-b border-outline-variant/20">
            <div className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-primary shadow-sm">
              <span className="material-symbols-outlined text-xl">auto_stories</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-primary tracking-tight">EduLit-AI</span>
              <span className="font-caption text-caption text-on-surface-variant">
                GDPT 2018 • Ngữ văn THPT Đan Phượng
              </span>
            </div>
          </div>

          {/* Teacher Navigation Group */}
          <div className="px-space-md py-space-sm">
            <div className="px-space-sm pb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
              Không gian Giáo viên
            </div>
            <nav className="flex flex-col gap-space-xs mt-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/assignments' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-sm ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
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

          {/* Prototype Role Switcher Group */}
          <div className="px-space-md pt-space-xs">
            <div className="my-space-sm h-[1px] bg-outline-variant/30"></div>
            <div className="px-space-sm pb-space-xs flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
                Xem trước vai trò
              </span>
              <span className="font-caption text-caption text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                Demo
              </span>
            </div>
            <nav className="flex flex-col gap-space-xs mt-1">
              <button
                onClick={() => handleSwitchToStudent('/assignments')}
                className="flex items-center gap-space-sm px-space-md py-space-sm rounded-lg text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-medium"
              >
                <span className="material-symbols-outlined text-[20px] text-secondary">edit_note</span>
                <span>Bài tập của em</span>
              </button>
              <button
                onClick={() => handleSwitchToStudent('/assignments?tab=submitted')}
                className="flex items-center gap-space-sm px-space-md py-space-sm rounded-lg text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-medium"
              >
                <span className="material-symbols-outlined text-[20px] text-secondary">task_alt</span>
                <span>Bài đã nộp &amp; Nhận xét</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Footer Card */}
        <div className="p-space-md bg-surface-container-low/60 m-space-md rounded-xl border border-outline-variant/20">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-primary text-[22px]">psychology</span>
            <div>
              <p className="font-label-md text-sm text-on-surface font-semibold">Mô hình Văn học AI</p>
              <p className="font-caption text-xs text-on-surface-variant">Chuẩn ma trận GDPT 2018</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-72 flex flex-col min-h-screen">
        {/* Desktop Top Header */}
        <header className="hidden lg:flex fixed top-0 left-72 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 items-center justify-between px-space-lg border-b border-outline-variant/20">
          <div className="flex items-center gap-space-md">
            {breadcrumb || (
              <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px] text-outline">school</span>
                <span>Lớp 12A1 • THPT Đan Phượng</span>
                <span className="text-outline-variant">/</span>
                <span className="text-on-surface font-semibold">Nghị luận xã hội GDPT 2018</span>
              </div>
            )}
            <span className="font-caption text-xs text-primary bg-primary-fixed px-space-sm py-0.5 rounded-full font-semibold">
              Chế độ xem thử
            </span>
          </div>

          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded-lg text-on-surface-variant font-caption text-xs">
              <span className="material-symbols-outlined text-[16px] text-tertiary">verified</span>
              <span>Đã khớp Rubric Bộ GD&amp;ĐT</span>
            </div>

            <div className="flex items-center gap-space-sm pl-space-md border-l border-outline-variant/40">
              <div className="text-right">
                <div className="font-label-md text-sm text-on-surface font-semibold">
                  {currentUser.name}
                </div>
                <div className="font-caption text-xs text-on-surface-variant">
                  GV Ngữ văn • THPT Đan Phượng
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs ring-2 ring-primary-container/40">
                {currentUser.avatarInitials || 'ĐL'}
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

