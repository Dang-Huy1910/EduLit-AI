'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import { AuthApiError } from '@/lib/auth-types';
import { authClient } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await authClient.forgotPassword(email.trim());
      setMessage(res.message);
    } catch (err) {
      setMessage(err instanceof AuthApiError ? err.message : 'Không gửi được yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] p-6 sm:p-8 border border-white/30 text-on-surface">
        <h2 className="text-xl font-extrabold font-merriweather text-slate-900 mb-2">Quên mật khẩu</h2>
        <p className="text-xs text-slate-500 mb-4">
          Nhập email tài khoản. Nếu email tồn tại, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="email" className="block text-xs font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-xs"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-secondary text-white text-xs font-bold disabled:opacity-50"
          >
            {loading ? 'Đang gửi...' : 'Gửi hướng dẫn'}
          </button>
        </form>
        {message && (
          <p className="mt-3 text-xs text-slate-600" aria-live="polite">
            {message}
          </p>
        )}
        <Link href="/login" className="mt-4 inline-block text-[11px] text-secondary font-semibold hover:underline">
          Quay lại đăng nhập
        </Link>
      </div>
    </AuthLayout>
  );
}
