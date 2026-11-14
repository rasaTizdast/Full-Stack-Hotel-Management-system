import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/noto-naskh-arabic';
import '@fontsource-variable/vazirmatn';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'اقامت در شیراز',
    template: '%s | اقامت در شیراز',
  },
  description: 'آشنایی با اقامتگاه و اتاق‌های آن در شیراز.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
