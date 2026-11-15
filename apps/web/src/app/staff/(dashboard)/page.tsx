'use client';

import { useStaffSession } from '@/components/staff/staff-session-provider';
import Link from 'next/link';

export default function StaffDashboardPage() {
  const { status, staff } = useStaffSession();
  if (status !== 'authenticated' || !staff) return null;

  return (
    <section className="staff-overview" aria-labelledby="staff-overview-title">
      <header className="staff-overview__hero">
        <div className="staff-overview__hero-copy">
          <h1 id="staff-overview-title">روز بخیر، {staff.username}</h1>
          <p className="staff-overview__intro">
            مسیر رسیدگی به اقامت مهمانان از همین‌جا شروع می‌شود. درخواست‌ها را بررسی کنید و وضعیت
            اتاق‌ها را به‌روز نگه دارید.
          </p>
          <div className="staff-overview__hero-actions">
            <Link className="staff-overview__primary-link" href="/staff/bookings">
              <span>مشاهده درخواست‌های رزرو</span>
              <span className="staff-overview__link-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h11M10 5l5 5-5 5" />
                </svg>
              </span>
            </Link>
            {staff.role === 'ADMIN' && (
              <Link className="staff-overview__secondary-link" href="/staff/inventory">
                مدیریت ظرفیت و نرخ‌ها
              </Link>
            )}
          </div>
        </div>
        <aside className="staff-overview__hero-note" aria-label="یادآوری روند کار">
          <span className="staff-overview__note-index">روال رسیدگی</span>
          <div className="staff-overview__note-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <path d="M10 24.5 19.5 34 38 14" />
              <circle cx="24" cy="24" r="20" />
            </svg>
          </div>
          <strong>بررسی، سپس تأیید</strong>
          <p>درخواست مهمان پس از پاسخ کارکنان به رزرو تبدیل می‌شود.</p>
        </aside>
      </header>

      <div className="staff-overview__section-heading">
        <div>
          <h2>از کجا شروع کنیم؟</h2>
        </div>
        <p>ابزارهای موردنیاز را بر اساس نقش خود باز کنید.</p>
      </div>

      <nav className="staff-overview__actions" aria-label="دسترسی سریع پنل">
        <Link
          className="staff-overview__action staff-overview__action--bookings"
          href="/staff/bookings"
        >
          <span className="staff-overview__action-topline">
            <span>مهمانان</span>
            <span className="staff-overview__action-arrow" aria-hidden="true">
              ↗
            </span>
          </span>
          <span className="staff-overview__action-icon" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none">
              <rect x="4.5" y="4.5" width="19" height="19" rx="4" />
              <path d="M9 10h10M9 14h10M9 18h6" />
            </svg>
          </span>
          <strong>درخواست‌های اقامت</strong>
          <span className="staff-overview__action-description">
            جزئیات هر درخواست را ببینید و پاسخ خود را ثبت کنید.
          </span>
          <span className="staff-overview__action-link">رفتن به فهرست درخواست‌ها</span>
        </Link>

        {staff.role === 'ADMIN' && (
          <Link
            className="staff-overview__action staff-overview__action--inventory"
            href="/staff/inventory"
          >
            <span className="staff-overview__action-topline">
              <span>برنامه‌ریزی</span>
              <span className="staff-overview__action-arrow" aria-hidden="true">
                ↗
              </span>
            </span>
            <span className="staff-overview__action-icon" aria-hidden="true">
              <svg viewBox="0 0 28 28" fill="none">
                <path d="m4.5 9 9.5-4.5L23.5 9 14 13.5 4.5 9Z" />
                <path d="m4.5 14 9.5 4.5 9.5-4.5M4.5 19l9.5 4.5 9.5-4.5" />
              </svg>
            </span>
            <strong>ظرفیت و نرخ اتاق‌ها</strong>
            <span className="staff-overview__action-description">
              ظرفیت و قیمت شبانه را برای بازه اقامت تنظیم کنید.
            </span>
            <span className="staff-overview__action-link">رفتن به برنامه اتاق‌ها</span>
          </Link>
        )}
      </nav>
    </section>
  );
}
