import type { Metadata } from 'next';
import Link from 'next/link';
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
            <span>شیراز · ایران</span>
          </div>
          <div className="staff-login-card__courtyard">
            <span className="staff-login-card__moon" />
            <span className="staff-login-card__arch staff-login-card__arch--outer" />
            <span className="staff-login-card__arch staff-login-card__arch--inner" />
            <span className="staff-login-card__pool" />
            <span className="staff-login-card__tile staff-login-card__tile--one" />
            <span className="staff-login-card__tile staff-login-card__tile--two" />
          </div>
          <p className="staff-login-card__art-caption">اقامت آرام، رسیدگی دقیق</p>
        </div>

        <div className="staff-login-card__content">
          <Link className="staff-login-card__back" href="/">
            <span aria-hidden="true">→</span> بازگشت به وب‌سایت
          </Link>
          <div className="staff-login-card__heading">
            <p className="staff-login-card__eyebrow">دسترسی کارکنان</p>
            <h1 id="staff-login-title">به پنل خوش آمدید</h1>
            <p>برای مدیریت درخواست‌های اقامت، با حساب کاری خود وارد شوید.</p>
          </div>
          <StaffLoginForm />
          <p className="staff-login-card__footnote">این بخش فقط برای کارکنان اقامتگاه است.</p>
        </div>
      </section>
    </main>
  );
}
