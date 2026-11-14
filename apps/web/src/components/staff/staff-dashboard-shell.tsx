'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { StaffMember } from '@/lib/staff-api';

interface StaffDashboardShellProps {
  staff: StaffMember;
  onLogout: () => void;
  isLoggingOut?: boolean;
  logoutError?: string | null;
  currentPath?: string;
  children: ReactNode;
}

export function StaffDashboardShell({
  staff,
  onLogout,
  isLoggingOut = false,
  logoutError,
  currentPath = '/staff',
  children,
}: StaffDashboardShellProps) {
  return (
    <div className="staff-shell">
      <a className="skip-link" href="#staff-main">
        رفتن به محتوای اصلی
      </a>
      <header className="staff-topbar">
        <Link className="staff-brand" href="/staff">
          <span className="staff-brand__mark" aria-hidden="true">
            ن
          </span>
          <span>
            <strong>خانه‌باغ نارنج</strong>
            <small>پنل کارکنان</small>
          </span>
        </Link>
        <div className="staff-identity">
          <span className="staff-identity__role">
            {staff.role === 'ADMIN' ? 'مدیر اقامتگاه' : 'پذیرش'}
          </span>
          <span className="staff-identity__email" dir="ltr">
            {staff.email}
          </span>
          <button className="staff-logout" type="button" onClick={onLogout} disabled={isLoggingOut}>
            {isLoggingOut ? 'در حال خروج…' : 'خروج از پنل'}
          </button>
        </div>
      </header>

      <div className="staff-layout">
        <aside className="staff-sidebar">
          <p className="staff-sidebar__label">کارهای روزانه</p>
          <nav aria-label="منوی پنل کارکنان" className="staff-nav">
            <Link href="/staff" aria-current={currentPath === '/staff' ? 'page' : undefined}>
              <span className="staff-nav__glyph" aria-hidden="true">
                ◇
              </span>
              نمای کلی
            </Link>
            <Link
              href="/staff/bookings"
              aria-current={currentPath.startsWith('/staff/bookings') ? 'page' : undefined}
            >
              <span className="staff-nav__glyph" aria-hidden="true">
                ▤
              </span>
              درخواست‌های رزرو
            </Link>
            {staff.role === 'ADMIN' && (
              <Link
                href="/staff/inventory"
                aria-current={currentPath.startsWith('/staff/inventory') ? 'page' : undefined}
              >
                <span className="staff-nav__glyph" aria-hidden="true">
                  ▦
                </span>
                ظرفیت و نرخ‌ها
              </Link>
            )}
          </nav>
          {logoutError && (
            <p className="staff-nav__error" role="alert">
              {logoutError}
            </p>
          )}
          <div className="staff-sidebar__note">
            <span aria-hidden="true">شیراز · خانه‌باغ نارنج</span>
            <span className="staff-sidebar__rule" />
            <span>امروز را با آرامش مدیریت کنید.</span>
          </div>
        </aside>

        <main className="staff-main" id="staff-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
