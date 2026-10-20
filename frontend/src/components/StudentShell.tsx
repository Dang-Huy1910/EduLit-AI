'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { SCHOOL_CONTEXT } from '@/lib/school-context';
import ToastContainer from './ToastContainer';
import FloatingChatWidget from './FloatingChatWidget';
import EduLitMark from './EduLitMark';
import AssistantMark from './AssistantMark';
import { useMobileDrawer } from './useMobileDrawer';

interface StudentShellProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
}

export default function StudentShell({
  children,
  headerTitle = `Khối ${SCHOOL_CONTEXT.gradeLevel} - Lớp ${SCHOOL_CONTEXT.classroomCode}`,
  headerSubtitle = 'Bài viết số 1 — Nghị luận xã hội',
}: StudentShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentUser,
    addToast,
    sidebarCollapsed,
    toggleSidebar,
  } = useAppStore();
  const authLogout = useAuthStore((s) => s.logout);
  const [mobileMenuOpen, setMobileMenuOpen] = useMobileDrawer();
  // The phone drawer always shows labels, whatever the desktop collapse setting is.
  const collapsed = sidebarCollapsed && !mobileMenuOpen;

  const studentNavItems = [
    { label: 'Bài tập của em', href: '/assignments', icon: 'edit_note' },
    { label: 'Bài đã nộp & Lịch sử chấm', href: '/assignments?tab=submitted', icon: 'task_alt' },
    { label: 'Hồ sơ văn phong của em', href: '/profile', icon: 'fingerprint' },
  ];

  const assistantNavItems = [
    {
      label: 'Chatbot Trợ lý Socratic',
      href: '/chatbot',
      badge: 'GPT',
    },
    {
      label: 'Tra cứu ngữ liệu đọc hiểu',
      href: '/materials',
      icon: 'menu_book',
    },
  ];

  const handleLogout = async () => {
    try {
      await authLogout();
      router.push('/login');
    } catch {
      addToast('Không đăng xuất được vì mất kết nối. Hãy thử lại.', 'error');
    }
  };

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      <ToastContainer />
      <FloatingChatWidget />

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-surface-container-lowest border-b border-outline-variant/30 z-50 flex items-center justify-between gap-2 px-2 sm:px-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Mở menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="app-sidebar"
            className="w-10 h-10 flex items-center justify-center text-on-surface hover:bg-surface-container rounded-lg"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <EduLitMark className="w-6 h-6 text-primary shrink-0" />
            <span className="font-headline-sm text-headline-sm text-primary truncate">EduLit-AI</span>
          </div>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-caption text-secondary bg-secondary-fixed/50 px-2.5 py-0.5 rounded-full text-xs font-semibold truncate max-w-[9rem]">
            {currentUser?.name || 'Học sinh'}
          </span>
          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </div>
      </div>

      {/* Tap outside the open drawer to close it. */}
      {mobileMenuOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-[55] bg-black/40"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        id="app-sidebar"
        className={`fixed left-0 top-0 h-full overflow-y-auto ${
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'
        } w-72 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-[60] lg:z-50 flex flex-col justify-between transition-all duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full invisible lg:visible lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Brand Block */}
          <div
            className={`h-16 px-4 flex items-center ${
              collapsed ? 'justify-center' : 'justify-between'
            } border-b border-outline-variant/20`}
          >
            <div className="flex items-center gap-space-sm overflow-hidden">
              <EduLitMark className="w-8 h-8 text-primary shrink-0" />
              {!collapsed && (
                <div className="flex flex-col truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-headline-sm text-headline-sm text-primary tracking-tight">EduLit-AI</span>
                    <span className="text-[10px] bg-secondary-fixed/50 text-secondary font-bold px-1.5 py-0.2 rounded">
                      GDPT 2018
                    </span>
                  </div>
                  <span className="font-caption text-caption text-on-surface-variant text-[11px] truncate">
                    Ngữ văn THPT Đan Phượng
                  </span>
                </div>
              )}
            </div>

            {!collapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                title="Thu gọn thanh điều hướng"
                className="hidden lg:flex p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-all"
              >
                <span className="material-symbols-outlined text-lg">dock_to_left</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Đóng menu"
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Student Nav */}
          <div className="px-3 py-space-sm">
            {!collapsed && (
              <div className="px-space-sm pb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
                Góc học tập
              </div>
            )}
            <nav className="flex flex-col gap-1 mt-1">
              {studentNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center ${
                      collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-space-md py-space-sm'
                    } rounded-xl transition-all text-sm ${
                      isActive
                        ? 'bg-secondary-container text-on-secondary-container font-semibold shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      {!collapsed && <span>{item.label}</span>}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Assistant Nav Group */}
          <div className="px-3 pt-space-xs">
            <div className="my-space-sm h-[1px] bg-outline-variant/30"></div>
            {!collapsed && (
              <div className="px-space-sm pb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline text-[11px]">
                Trợ lý học tập AI
              </div>
            )}
            <nav className="flex flex-col gap-1 mt-1">
              {assistantNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center ${
                      collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-space-md py-space-sm'
                    } rounded-xl transition-all text-sm ${
                      isActive
                        ? 'bg-secondary-container text-on-secondary-container font-semibold shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-space-sm">
                      {item.icon ? (
                        <span className="material-symbols-outlined text-[20px] text-secondary">{item.icon}</span>
                      ) : (
                        <AssistantMark outline className="w-5 h-5 shrink-0 text-secondary" />
                      )}
                      {!collapsed && <span>{item.label}</span>}
                    </div>
                    {!collapsed && item.badge && (
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
        {!collapsed && (
          <div className="p-space-md bg-surface-container-low/60 m-space-md rounded-xl border border-outline-variant/20 hidden lg:flex items-center">
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
        )}

        {/* Account and logout on phones, where the desktop header is hidden. */}
        <div className="lg:hidden m-3 p-3 rounded-xl border border-outline-variant/30 bg-surface-container-low/60 space-y-3">
          <Link href="/account/security" className="flex items-center gap-3 min-w-0 rounded-lg">
            <span className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs shrink-0">
              {currentUser?.avatarInitials || 'HS'}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-on-surface truncate">{currentUser?.name || 'Học sinh'}</span>
              <span className="block text-xs text-on-surface-variant truncate">Lớp {currentUser?.classId || SCHOOL_CONTEXT.classroomCode} • THPT Đan Phượng</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full h-10 rounded-lg border border-error/40 bg-surface-container-lowest text-sm font-semibold text-error hover:bg-error-container/30 flex items-center justify-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Đăng xuất
          </button>
        </div>
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
            <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px] text-outline">assignment</span>
              <span>{headerTitle}</span>
              <span className="text-outline-variant">/</span>
              <span className="text-on-surface font-semibold">{headerSubtitle}</span>
            </div>
            <span className="font-caption text-xs bg-secondary-fixed/50 text-secondary px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              <span>Học sinh: {currentUser?.name || 'Học sinh'}</span>
            </span>
          </div>

          <div className="flex items-center gap-space-lg">
            <Link
              href="/chatbot"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-secondary via-secondary-container to-primary text-white font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-sm"
            >
              <AssistantMark className="w-4 h-4 shrink-0" />
              <span>EduLit Chatbot AI</span>
              <span className="text-[10px] bg-white/20 px-1 py-0.2 rounded-full uppercase font-mono">GPT</span>
            </Link>

            <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 px-2.5 py-1 rounded-full font-caption text-xs font-semibold shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Mã hóa ẩn danh PII-Shield</span>
            </div>

            <div className="flex items-center gap-space-sm pl-space-md border-l border-outline-variant/40">
              <div className="text-right">
                <div className="font-label-md text-sm text-on-surface font-semibold">
                  {currentUser?.name || 'Học sinh'}
                </div>
                <div className="font-caption text-xs text-on-surface-variant">
                  Lớp {currentUser?.classId || SCHOOL_CONTEXT.classroomCode} • THPT Đan Phượng
                </div>
              </div>
              <Link
                href="/account/security"
                title="Bảo mật tài khoản"
                className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs ring-2 ring-secondary-container/40"
              >
                {currentUser?.avatarInitials || 'HS'}
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                title="Đăng xuất"
                aria-label="Đăng xuất"
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

