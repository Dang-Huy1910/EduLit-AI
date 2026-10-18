'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import StudentShell from '@/components/StudentShell';
import PasswordField from '@/components/PasswordField';
import { useAuthStore } from '@/lib/auth-store';
import { authClient } from '@/lib/auth-client';
import { AuthApiError, SessionItem } from '@/lib/auth-types';
import { useAppStore } from '@/lib/store';

export default function AccountSecurityPage() {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const addToast = useAppStore((s) => s.addToast);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const isTeacher = authUser?.role === 'TEACHER';
  const Shell = isTeacher ? TeacherShell : StudentShell;

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await authClient.listSessions();
      setSessions(res.sessions);
    } catch {
      addToast('Không tải được danh sách phiên.', 'error');
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (newPassword.length < 15) {
      addToast('Mật khẩu mới phải từ 15 ký tự.', 'warning');
      return;
    }
    if (newPassword !== confirm) {
      addToast('Nhập lại mật khẩu chưa khớp.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await authClient.changePassword(currentPassword, newPassword);
      clear();
      addToast('Đã đổi mật khẩu. Hãy đăng nhập lại.', 'success');
      router.push('/login');
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không đổi được mật khẩu.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await authClient.revokeSession(id);
      const current = sessions.find((s) => s.id === id)?.isCurrent;
      if (current) {
        clear();
        router.push('/login');
        return;
      }
      await loadSessions();
      addToast('Đã thu hồi phiên.', 'success');
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không thu hồi được phiên.', 'error');
    }
  };

  const logoutAll = async () => {
    try {
      await authClient.logoutAll();
      clear();
      router.push('/login');
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không đăng xuất mọi thiết bị được.', 'error');
    }
  };

  return (
    <Shell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-merriweather">Bảo mật tài khoản</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {authUser?.displayName} · {authUser?.email} · {isTeacher ? 'Giáo viên' : 'Học sinh'}
          </p>
        </div>

        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 space-y-3">
          <h2 className="font-semibold">Đổi mật khẩu</h2>
          <form onSubmit={changePassword} className="space-y-3 max-w-md">
            <PasswordField
              id="current"
              label="Mật khẩu hiện tại"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
            <PasswordField
              id="new"
              label="Mật khẩu mới"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <PasswordField
              id="confirm"
              label="Nhập lại mật khẩu mới"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-secondary text-white text-xs font-bold disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Đổi mật khẩu'}
            </button>
          </form>
        </section>

        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Phiên đăng nhập</h2>
            <button type="button" onClick={() => void logoutAll()} className="text-xs font-semibold text-error hover:underline">
              Đăng xuất mọi thiết bị
            </button>
          </div>
          {loadingSessions ? (
            <p className="text-xs text-on-surface-variant">Đang tải phiên...</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-start justify-between gap-3 border border-outline-variant/20 rounded-lg p-3">
                  <div className="text-xs">
                    <p className="font-semibold">
                      {session.isCurrent ? 'Thiết bị hiện tại' : 'Thiết bị khác'}
                      {session.persistent ? ' · Ghi nhớ đăng nhập' : ' · Phiên ngắn'}
                    </p>
                    <p className="text-on-surface-variant mt-0.5 break-all">{session.userAgent || 'Không rõ trình duyệt'}</p>
                    <p className="text-on-surface-variant">
                      Địa chỉ mạng (theo máy chủ, không phải vị trí chính xác): {session.ipAddress || 'không có'}
                    </p>
                    <p className="text-on-surface-variant">Tạo lúc {new Date(session.createdAt).toLocaleString('vi-VN')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revoke(session.id)}
                    className="text-xs font-semibold text-secondary hover:underline shrink-0"
                  >
                    Thu hồi
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
