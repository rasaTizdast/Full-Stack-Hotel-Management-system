'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HotelLogo } from '@/components/brand/hotel-logo';
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
  const staffNavRef = useRef<HTMLElement>(null);
  const [hasNavOverflow, setHasNavOverflow] = useState(false);

  useEffect(() => {
    const nav = staffNavRef.current;
    if (!nav) return;

    const activeLink = nav.querySelector<HTMLElement>('a[aria-current="page"]');
    if (activeLink && typeof activeLink.scrollIntoView === 'function') {
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      activeLink.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }

    const measureOverflow = () => {
      setHasNavOverflow(nav.scrollWidth > nav.clientWidth + 1);
    };
    measureOverflow();
    window.addEventListener('resize', measureOverflow);
    return () => window.removeEventListener('resize', measureOverflow);
  }, [currentPath, staff.role]);

  return (
    <div className="staff-shell">
      <a className="skip-link" href="#staff-main">
        رفتن به محتوای اصلی
      </a>
      <header className="staff-topbar">
        <Link className="staff-brand" href="/staff">
          <HotelLogo size={44} className="staff-brand__mark" />
          <span className="staff-brand__copy">
            <strong>خانه‌باغ نارنج</strong>
            <small>پنل کارکنان</small>
          </span>
        </Link>
        <div className="staff-topbar__right">
          <span className="staff-property-label">
            شیراز، خانه‌باغ نارنج
          </span>
          <div className="staff-identity">
            <span className="staff-identity__avatar" aria-hidden="true">
              {staff.username.slice(0, 1)}
            </span>
            <span className="staff-identity__copy">
              <strong>{staff.username}</strong>
              <small className="staff-identity__role">
                {staff.role === 'ADMIN' ? 'مدیر اقامتگاه' : 'پذیرش'}
              </small>
            </span>
            {staff.email.toLowerCase() !== staff.username.trim().toLowerCase() && (
              <span className="staff-identity__email" dir="ltr">
                {staff.email}
              </span>
            )}
          </div>
          <button
            aria-label="خروج از پنل"
            className="staff-logout"
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M8 4H4.5v12H8M11 6l4 4-4 4M7 10h8" />
            </svg>
            <span>{isLoggingOut ? 'در حال خروج…' : 'خروج'}</span>
          </button>
        </div>
      </header>

      <div className="staff-layout">
        <aside className="staff-sidebar">
          <div className="staff-sidebar__heading">
            <p className="staff-sidebar__label">فضای کاری</p>
            <span>شیراز، ایران</span>
          </div>
          <div className={`staff-nav-viewport${hasNavOverflow ? ' staff-nav-viewport--overflow' : ''}`}>
          <nav ref={staffNavRef} aria-label="منوی پنل کارکنان" className="staff-nav">
            <Link
              href="/staff"
              aria-current={currentPath === '/staff' ? 'page' : undefined}
            >
              <span className="staff-nav__glyph" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9M9.5 19v-5.5h5V19" />
                </svg>
              </span>
              <span className="staff-nav__copy">
                <strong>نمای کلی</strong>
                <small>شروع و دسترسی سریع</small>
              </span>
            </Link>
            <Link
              href="/staff/bookings"
              aria-current={currentPath.startsWith('/staff/bookings') ? 'page' : undefined}
            >
              <span className="staff-nav__glyph" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="4.5" y="5" width="15" height="14" rx="2" />
                  <path d="M8 9h8M8 12h8M8 15h5" />
                </svg>
              </span>
              <span className="staff-nav__copy">
                <strong>درخواست‌های رزرو</strong>
                <small>بررسی و پاسخ به مهمانان</small>
              </span>
            </Link>
            {staff.role === 'ADMIN' && (
              <Link
                href="/staff/rooms/manage"
                aria-current={currentPath.startsWith('/staff/rooms') ? 'page' : undefined}
              >
                <span className="staff-nav__glyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 19.5h16M5.5 19V7.5h13V19M8 10h3v3H8zM13 10h3v3h-3zM8 15h3v4H8zM13 15h3v2h-3z" />
                  </svg>
                </span>
                <span className="staff-nav__copy">
                  <strong>اتاق‌های فیزیکی</strong>
                {' '}
                  <small>شماره و وضعیت اتاق‌ها</small>
                </span>
              </Link>
            )}
            {staff.role === 'ADMIN' && (
              <Link
                href="/staff/inventory"
                aria-current={currentPath.startsWith('/staff/inventory') ? 'page' : undefined}
              >
                <span className="staff-nav__glyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4.5 7.5 12 4l7.5 3.5L12 11 4.5 7.5Z" />
                    <path d="M4.5 12 12 15.5 19.5 12M4.5 16.5 12 20l7.5-3.5" />
                  </svg>
                </span>
                <span className="staff-nav__copy">
                  <strong>ظرفیت و نرخ‌ها</strong>
                  {' '}
                  <small>تنظیم برنامه اتاق‌ها</small>
                </span>
              </Link>
            )}
          </nav>
            <span className="staff-nav-overflow-cue" data-staff-nav-overflow-cue aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="m10 3-5 5 5 5" />
              </svg>
            </span>
          </div>
          {logoutError && (
            <p className="staff-nav__error" role="alert">
              {logoutError}
            </p>
          )}
          <div className="staff-sidebar__note">
            <HotelLogo size={38} className="staff-sidebar__note-mark" />
            <div>
              <strong>خانه‌باغ نارنج</strong>
              <span>پنل مدیریت اقامتگاه نمونه</span>
            </div>
          </div>
        </aside>

        <main className="staff-main" id="staff-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
