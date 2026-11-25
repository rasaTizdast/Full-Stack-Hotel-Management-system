import type { Metadata } from 'next';
import Link from 'next/link';
import { HotelLogo } from '@/components/brand/hotel-logo';
import { StaffLoginForm } from '@/components/staff/staff-login-form';

export const metadata: Metadata = {
  title: 'ورود کارکنان',
  robots: { index: false, follow: false },
};

export default function StaffLoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 sm:px-8">
      <section
        className="grid min-h-[min(48rem,calc(100dvh-4rem))] w-full max-w-6xl overflow-hidden rounded-3xl border border-border bg-surface shadow-sm lg:grid-cols-2"
        aria-labelledby="staff-login-title"
      >
        <div className="relative hidden min-h-[38rem] flex-col justify-between overflow-hidden bg-primary-strong bg-[url('/images/hotel/courtyard-hero.webp')] bg-cover bg-center p-10 text-primary-foreground lg:flex">
          <div className="absolute inset-0 bg-primary-strong/60" aria-hidden="true" />
          <div className="relative z-10 flex justify-between gap-4 text-sm font-semibold">
            <span>خانه‌باغ نارنج</span>
            <span>شیراز، ایران</span>
          </div>
          <span
            className="absolute left-1/2 top-1/2 z-10 grid size-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-primary-foreground/60 bg-primary-strong/30 text-primary-foreground outline outline-8 outline-primary-foreground/10"
            aria-hidden="true"
          >
            <HotelLogo size={112} />
          </span>
          <div className="relative z-10 grid gap-1">
            <p className="text-3xl font-bold">اقامت آرام، رسیدگی دقیق</p>
            <small className="text-sm text-primary-foreground/80">
              تصویرسازی مفهومی از یک اقامتگاه نمونه
            </small>
          </div>
        </div>

        <div className="flex flex-col p-6 sm:p-10 lg:p-14">
          <Link
            className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring"
            href="/"
          >
            بازگشت به وب‌سایت
          </Link>
          <div className="my-auto py-4 sm:py-6">
            <h1
              id="staff-login-title"
              className="text-3xl font-bold leading-tight text-primary-strong sm:text-4xl"
            >
              به پنل خوش آمدید
            </h1>
            <p className="mt-3 text-base leading-8 text-muted-foreground">
              مدیریت درخواست‌های اقامت
            </p>
          </div>
          <StaffLoginForm />
          <p className="mt-8 border-t border-border pt-5 text-sm leading-7 text-muted-foreground">
            این بخش فقط برای کارکنان اقامتگاه است.
          </p>
        </div>
      </section>
    </main>
  );
}
