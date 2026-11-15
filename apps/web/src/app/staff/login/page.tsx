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
    <main className="staff-login-page">
      <section className="staff-login-card" aria-labelledby="staff-login-title">
        <div className="staff-login-card__art" aria-hidden="true">
          <div className="staff-login-card__art-topline">
            <span>خانه‌باغ نارنج</span>
            <span>شیراز، ایران</span>
          </div>
          <span className="staff-login-card__art-seal" aria-hidden="true">
            <HotelLogo size={112} />
          </span>
          <div className="staff-login-card__art-caption">
            <p>اقامت آرام، رسیدگی دقیق</p>
            <small>تصویرسازی مفهومی از یک اقامتگاه نمونه</small>
          </div>
        </div>

        <div className="staff-login-card__content">
          <Link className="staff-login-card__back" href="/">
            بازگشت به وب‌سایت
          </Link>
          <div className="staff-login-card__heading">
            <h1 id="staff-login-title">به پنل خوش آمدید</h1>
            <p>مدیریت درخواست‌های اقامت</p>
          </div>
          <StaffLoginForm />
          <p className="staff-login-card__footnote">این بخش فقط برای کارکنان اقامتگاه است.</p>
        </div>
      </section>
    </main>
  );
}
