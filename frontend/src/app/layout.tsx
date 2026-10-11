import type { Metadata } from 'next';
import { Inter, Merriweather } from 'next/font/google';
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${inter.variable} ${merriweather.variable}`}>
      <body className="bg-surface text-on-surface font-body-md antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}

