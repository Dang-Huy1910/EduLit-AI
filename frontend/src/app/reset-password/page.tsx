'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import PasswordField from '@/components/PasswordField';
import { AuthApiError } from '@/lib/auth-types';
import { authClient } from '@/lib/auth-client';
import { consumeAuthTokenFromLocation } from '@/lib/auth-hash';

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setToken(consumeAuthTokenFromLocation());
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !token) return;
    if (password.length < 6) {
      setError('Mật khẩu mới phải từ 6 đến 128 ký tự.');
      return;
    }
    if (password !== confirm) {
      setError('Nhập lại mật khẩu chưa khớp.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authClient.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không đặt lại được mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="text-on-surface">
        <h2 className="text-xl font-extrabold font-merriweather text-slate-900 mb-2">Đặt lại mật khẩu</h2>
        {!token && !done && (
          <p className="text-xs text-error">Thiếu liên kết đặt lại mật khẩu. Hãy yêu cầu email mới.</p>
        )}
        {done ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600" aria-live="polite">
              Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.
            </p>
            <Link href="/login" className="block text-center py-2.5 rounded-lg bg-secondary text-white text-xs font-bold">
              Đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <p className="text-xs text-error" role="alert">
                {error}
              </p>
            )}
            <PasswordField
              id="newPassword"
              label="Mật khẩu mới"
              value={password}
              onChange={setPassword}
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
              disabled={loading || !token}
              className="w-full py-2.5 rounded-lg bg-secondary text-white text-xs font-bold disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Đặt mật khẩu mới'}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
