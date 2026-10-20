'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { SCHOOL_CONTEXT } from '@/lib/school-context';
import ToastContainer from './ToastContainer';
import FloatingChatWidget from './FloatingChatWidget';
import EduLitMark from './EduLitMark';

interface TeacherShellProps {
  children: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export default function TeacherShell({ children, breadcrumb }: TeacherShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentUser,
    resetDemoState,
    addToast,
    sidebarCollapsed,
    toggleSidebar,
  } = useAppStore();
  const authLogout = useAuthStore((s) => s.logout);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Quản lý bài tập', href: '/assignments', icon: 'assignment' },
    { label: 'Kho ngữ liệu & Chuyên đề', href: '/materials', icon: 'menu_book' },
    { label: 'Báo cáo năng lực', href: '/reports', icon: 'analytics' },
    { label: 'Chatbot Trợ lý Sư phạm', href: '/chatbot', icon: 'smart_toy', badge: 'GPT' },
  ];

  const handleLogout = async () => {
    try {
      await authLogout();
      router.push('/login');
    } catch {
      addToast('Không đăng xuất được vì mất kết nối. Hãy thử lại.', 'error');
    }
  };

  const handleResetDemo = () => {
    resetDemoState('teacher');
    addToast('Đã khôi phục toàn bộ dữ liệu demo ban đầu!', 'success');
    window.location.href = '/assignments';
  };

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      <ToastContainer />
      <FloatingChatWidget />

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
            <EduLitMark className="w-6 h-6 text-primary shrink-0" />
            <span className="font-headline-sm text-headline-sm text-primary">EduLit-AI</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-caption text-secondary bg-secondary-fixed/50 px-2.5 py-0.5 rounded-full text-xs font-semibold">
            Giáo viên
          </span>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed left-0 top-0 h-full ${
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'
        } w-72 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col justify-between transition-all duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Logo Brand Header */}
          <div
            className={`h-16 px-4 flex items-center ${
              sidebarCollapsed ? 'justify-center' : 'justify-between'
            } border-b border-outline-variant/20`}
          >
            <div className="flex items-center gap-space-sm overflow-hidden">
              <EduLitMark className="w-8 h-8 text-primary shrink-0" />
              {!sidebarCollapsed && (
                <div className="flex flex-col truncate">
                  <span className="font-headline-sm text-headline-sm text-primary tracking-tight">EduLit-AI</span>
                  <span className="font-caption text-caption text-on-surface-variant truncate">
                    THPT Đan Phượng
                  </span>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                title="Thu gọn thanh điều hướng"
                className="hidden lg:flex p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-all"
              >
                <span className="material-symbols-outlined text-lg">dock_to_left</span>
              </button>
            )}
          </div>

          {/* Teacher Navigation Group */}
          <div className="px-3 py-space-sm">
            {!sidebarCollapsed && (
              <div className="px-space-sm pb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
                Không gian Giáo viên
              </div>
            )}
            <nav className="flex flex-col gap-1 mt-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/assignments' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={sidebarCollapsed ? item.label : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center ${
                      sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-space-md py-space-sm'
                    } rounded-xl transition-all text-sm ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </div>
                    {!sidebarCollapsed && item.badge && (
                      <span className="text-[10px] bg-secondary-fixed/50 text-secondary font-bold px-1.5 py-0.2 rounded-full uppercase">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Footer Card */}
        {!sidebarCollapsed ? (
          <div className="p-space-md bg-surface-container-low/60 m-space-md rounded-xl border border-outline-variant/20 flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary text-[22px]">psychology</span>
              <div>
                <p className="font-label-md text-sm text-on-surface font-semibold">Mô hình Văn học AI</p>
                <p className="font-caption text-xs text-on-surface-variant">Chuẩn ma trận GDPT 2018</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetDemo}
              title="Khôi phục trạng thái ban đầu"
              className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-all flex items-center justify-center shrink-0"
            >
              <span className="material-symbols-outlined text-lg">restart_alt</span>
            </button>
          </div>
        ) : (
          <div className="p-2 flex justify-center mb-3">
            <button
              type="button"
              onClick={handleResetDemo}
              title="Khôi phục trạng thái ban đầu"
              className="p-2 rounded-xl text-outline hover:text-primary hover:bg-surface-container transition-all flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-xl">restart_alt</span>
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className={`${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'} flex flex-col min-h-screen transition-all duration-300`}>
        {/* Desktop Top Header */}
        <header
          className={`hidden lg:flex fixed top-0 right-0 ${
            sidebarCollapsed ? 'left-20' : 'left-72'
          } h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 items-center justify-between px-space-lg border-b border-outline-variant/20 transition-all duration-300`}
        >
          <div className="flex items-center gap-space-md">
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                title="Mở rộng thanh điều hướng"
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all flex items-center justify-center mr-1"
              >
                <span className="material-symbols-outlined text-lg">dock_to_right</span>
              </button>
            )}
            {breadcrumb || (
              <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px] text-outline">school</span>
                <span>Lớp {SCHOOL_CONTEXT.classroomCode} • THPT Đan Phượng</span>
                <span className="text-outline-variant">/</span>
                <span className="text-on-surface font-semibold">Nghị luận xã hội GDPT 2018</span>
              </div>
            )}
            <span className="font-caption text-xs bg-primary-container/20 text-primary px-2.5 py-0.5 rounded-full font-semibold border border-primary/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              <span>{SCHOOL_CONTEXT.semester} • {SCHOOL_CONTEXT.academicYear}</span>
            </span>
          </div>

          <div className="flex items-center gap-space-lg">
            <Link
              href="/chatbot"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#4A154B] via-[#6B21A8] to-primary text-white font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">smart_toy</span>
              <span>EduLit Chatbot AI</span>
              <span className="text-[10px] bg-white/20 px-1 py-0.2 rounded-full uppercase font-mono">GPT</span>
            </Link>

            <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 px-2.5 py-1 rounded-full font-caption text-xs font-semibold shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Đã khớp Rubric Bộ GD&amp;ĐT</span>
            </div>

            <div className="flex items-center gap-space-sm pl-space-md border-l border-outline-variant/40">
              <div className="text-right">
                <div className="font-label-md text-sm text-on-surface font-semibold">
                  {currentUser?.name || 'Giáo viên'}
                </div>
                <div className="font-caption text-xs text-on-surface-variant">
                  GV Ngữ văn • THPT Đan Phượng
                </div>
              </div>
              <Link
                href="/account/security"
                title="Bảo mật tài khoản"
                className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs ring-2 ring-primary-container/40"
              >
                {currentUser?.avatarInitials || 'GV'}
              </Link>
              <button
                onClick={() => void handleLogout()}
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

