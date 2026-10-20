import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Inter, Merriweather } from 'next/font/google';
import AuthGate from '@/components/AuthGate';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

const merriweather = Merriweather({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-merriweather',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EduLit-AI — Ngữ văn THPT Đan Phượng (GDPT 2018)',
  description: 'Trợ lý số hóa và đánh giá bài viết môn Ngữ văn THPT Đan Phượng theo định hướng GDPT 2018.',
  icons: {
    icon: [
      { url: '/brand/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/brand/edulit-app-icon-small.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/brand/apple-touch-icon.png', sizes: '180x180' },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${inter.variable} ${merriweather.variable}`} suppressHydrationWarning>
      <body className="bg-surface text-on-surface font-body-md antialiased min-h-screen" suppressHydrationWarning>
        <Suspense fallback={null}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </body>
    </html>
  );
}

