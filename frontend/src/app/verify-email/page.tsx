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
      <div className="text-on-surface space-y-4">
        <h2 className="text-xl font-extrabold font-merriweather text-slate-900">Xác minh email</h2>
        <p className="text-xs text-slate-600" aria-live="polite">
          {status === 'verifying' ? 'Đang xác minh liên kết...' : message}
        </p>
        {status === 'verified' ? (
          <Link href="/login" className="block w-full text-center py-2.5 rounded-lg bg-secondary text-white text-xs font-bold shadow-sm hover:bg-secondary/90 transition-colors">
            Đăng nhập ngay
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
              placeholder="nhap.email@danphuong.edu.vn"
              className="w-full px-3 py-2.5 rounded-lg border border-yellow-200 bg-amber-50/50 text-xs text-slate-900 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            <button
              type="button"
              onClick={() => void resend()}
              disabled={sending || cooldown > 0 || !email.trim()}
              className="w-full py-2.5 rounded-lg border border-secondary text-secondary text-xs font-bold hover:bg-secondary/10 disabled:opacity-50 transition-colors"
            >
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : sending ? 'Đang gửi...' : 'Gửi lại email xác minh'}
            </button>

            {/* Hướng dẫn kiểm tra mục Thư rác / Spam */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-900 space-y-1.5 mt-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <span className="material-symbols-outlined text-base text-amber-700">mark_email_unread</span>
                <span>Chưa thấy email kích hoạt?</span>
              </div>
              <p className="text-[11px] text-amber-800/95 leading-relaxed">
                Vui lòng kiểm tra mục <strong>Thư rác (Spam)</strong> hoặc <strong>Quảng cáo</strong> trong hộp thư của em. Nếu tìm thấy thư tại đây, hãy mở ra và chọn <em>&quot;Báo cáo không phải thư rác&quot;</em> để hệ thống luôn nhận diện thư từ trường học nhé!
              </p>
            </div>

            <Link href="/login" className="block text-center text-[11px] text-secondary font-semibold hover:underline pt-1">
              Đã xác minh? Đăng nhập
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
