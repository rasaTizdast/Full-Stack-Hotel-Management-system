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
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth" className="print:bg-white">
      <body className="selection:bg-highlight/40 selection:text-foreground print:m-0 print:bg-white print:text-neutral-950">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
