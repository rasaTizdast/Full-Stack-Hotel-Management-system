import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: {
    default: 'خانه‌باغ نارنج | اقامت در شیراز',
    template: '%s | خانه‌باغ نارنج',
  },
  description:
    'اتاق‌های نمایشی خانه‌باغ نارنج در شیراز را ببینید، تاریخ اقامت و ظرفیت را بررسی کنید و درخواست خود را برای تأیید کارکنان بفرستید.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
