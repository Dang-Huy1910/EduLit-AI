'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import ToastContainer from './ToastContainer';
import FloatingChatWidget from './FloatingChatWidget';

interface TeacherShellProps {
  children: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export default function TeacherShell({ children, breadcrumb }: TeacherShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentUser,
    logout,
    resetDemoState,
    addToast,
    sidebarCollapsed,
    toggleSidebar,
  } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Bài tập & Đề kiểm tra', href: '/assignments', icon: 'assignment' },
    { label: 'Kho ngữ liệu & Chuyên đề', href: '/materials', icon: 'menu_book' },
    { label: 'Báo cáo năng lực lớp', href: '/reports', icon: 'analytics' },
    { label: 'Trợ lý chấm & Rubric', href: '/assignments/assign-nlxh-01', icon: 'auto_awesome' },
    { label: 'Chatbot Trợ lý Sư phạm', href: '/chatbot', icon: 'smart_toy', badge: 'GPT' },
  ];

  const handleLogout = () => {
    logout();
    router.push('/login');
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
            <span className="material-symbols-outlined text-primary text-2xl">auto_stories</span>
            <span className="font-headline-sm text-headline-sm text-primary">EduLit-AI</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetDemoState();
              addToast('Đã khôi phục dữ liệu Demo về trạng thái ban đầu!', 'success');
            }}
            title="Khôi phục trạng thái Demo"
            className="p-1 rounded text-amber-700 hover:bg-amber-100 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">restart_alt</span>
          </button>
          <span className="font-caption text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-full text-xs">
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
              <div className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-primary shadow-sm shrink-0">
                <span className="material-symbols-outlined text-xl">auto_stories</span>
              </div>
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
        {!sidebarCollapsed && (
          <div className="p-space-md bg-surface-container-low/60 m-space-md rounded-xl border border-outline-variant/20">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary text-[22px]">psychology</span>
              <div>
                <p className="font-label-md text-sm text-on-surface font-semibold">Mô hình Văn học AI</p>
                <p className="font-caption text-xs text-on-surface-variant">Chuẩn ma trận GDPT 2018</p>
              </div>
            </div>
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
                <span>Lớp 12A1 • THPT Đan Phượng</span>
                <span className="text-outline-variant">/</span>
                <span className="text-on-surface font-semibold">Nghị luận xã hội GDPT 2018</span>
              </div>
            )}
            <span className="font-caption text-xs text-primary bg-primary-fixed px-space-sm py-0.5 rounded-full font-semibold">
              Chế độ xem thử
            </span>
            <button
              onClick={() => {
                resetDemoState();
                addToast('Đã khôi phục dữ liệu Demo về trạng thái ban đầu!', 'success');
              }}
              title="Khôi phục trạng thái ban đầu của hệ thống demo"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-xs transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-sm text-amber-600">restart_alt</span>
              <span>Khôi phục Demo</span>
            </button>
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

