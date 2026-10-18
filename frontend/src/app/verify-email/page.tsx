'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { AuthApiError } from '@/lib/auth-types';
import { authClient } from '@/lib/auth-client';
import { consumeAuthTokenFromLocation, verifyEmailOnce } from '@/lib/auth-hash';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get('email') || '';
  const [email, setEmail] = useState(emailFromQuery);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>('idle');
  const [message, setMessage] = useState('Hãy kiểm tra hộp thư (và thư mục spam) để xác minh email, rồi đăng nhập.');
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = (token: string) => {
      setStatus('verifying');
      void verifyEmailOnce(token)
        .then((res) => {
          if (cancelled) return;
          setStatus('verified');
          setMessage(res.message);
        })
        .catch((err) => {
          if (cancelled) return;
          setStatus('error');
          setMessage(err instanceof AuthApiError ? err.message : 'Không xác minh được email.');
        });
    };

    const token = consumeAuthTokenFromLocation();
    if (token) run(token);

    const onHash = () => {
      const next = consumeAuthTokenFromLocation();
      if (next) run(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const resend = async () => {
    if (!email.trim() || sending || cooldown > 0) return;
    setSending(true);
    try {
      const res = await authClient.resendVerification(email.trim());
      setMessage(res.message);
      setCooldown(30);
    } catch (err) {
      setMessage(err instanceof AuthApiError ? err.message : 'Không gửi lại được email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthLayout>
      <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] p-6 sm:p-8 border border-white/30 text-on-surface space-y-4">
        <h2 className="text-xl font-extrabold font-merriweather text-slate-900">Xác minh email</h2>
        <p className="text-xs text-slate-600" aria-live="polite">
          {status === 'verifying' ? 'Đang xác minh liên kết...' : message}
        </p>
        {status === 'verified' ? (
          <Link href="/login" className="block w-full text-center py-2.5 rounded-lg bg-secondary text-white text-xs font-bold">
            Đăng nhập
          </Link>
        ) : (
          <>
            <label htmlFor="email" className="block text-xs font-semibold text-slate-800">
              Email đã đăng ký
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-xs"
            />
            <button
              type="button"
              onClick={() => void resend()}
              disabled={sending || cooldown > 0 || !email.trim()}
              className="w-full py-2.5 rounded-lg border border-secondary text-secondary text-xs font-bold disabled:opacity-50"
            >
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : sending ? 'Đang gửi...' : 'Gửi lại email xác minh'}
            </button>
            <Link href="/login" className="block text-center text-[11px] text-secondary font-semibold hover:underline">
              Đã xác minh? Đăng nhập
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
