'use client';
import { staffClass } from '@/components/staff/staff-classes';

import Link from 'next/link';
import { useStaffSession } from '@/components/staff/staff-session-provider';
import { getStaffRoleLabel } from '@/lib/staff-navigation';
import type { StaffRole } from '@/lib/staff-api';

const operationalLinks = {
  frontDesk: {
    href: '/staff/front-desk/arrivals',
    title: 'میز پذیرش',
    detail: 'ورودهای امروز، مهمانان حاضر و موعدهای خروج را پیگیری کنید.',
  },
  inventory: {
    href: '/staff/inventory',
    title: 'مدیریت ظرفیت و نرخ‌ها',
    detail: 'برنامه ظرفیت و نرخ اقامت را مشاهده و به‌روزرسانی کنید.',
  },
  rooms: {
    href: '/staff/rooms/manage',
    title: 'مدیریت اتاق‌های فیزیکی',
    detail: 'شماره، وضعیت و ویژگی اتاق‌های اقامتگاه را مدیریت کنید.',
  },
  bookings: {
    href: '/staff/bookings',
    title: 'مشاهده درخواست‌های رزرو',
    detail: 'درخواست‌های رزرو ثبت‌شده را بررسی و پیگیری کنید.',
  },
  accounts: {
    href: '/staff/staff',
    title: 'مدیریت کارکنان',
    detail: 'حساب‌های کارکنان و سطح دسترسی آن‌ها را مدیریت کنید.',
  },
  close: {
    href: '/staff/operations/close',
    title: 'بستن روز کاری',
    detail: 'هزینه اقامت شب را ثبت و تاریخ کاری را منتقل کنید.',
  },
  reports: {
    href: '/staff/reports',
    title: 'گزارش روزانه',
    detail: 'ورود و خروج، آمادگی اتاق‌ها و گردش مالی را مرور کنید.',
  },
  folioLookup: {
    href: '/staff/folios/lookup',
    title: 'جستجوی صورتحساب',
    detail: 'با کد رزرو، صورتحساب مهمان حاضر یا مانده قابل‌دریافت را پیدا کنید.',
  },
};

type OperationalLink = (typeof operationalLinks)[keyof typeof operationalLinks];

const roleWorkspace: Record<StaffRole, { heading: string; links: readonly OperationalLink[] }> = {
  ADMIN: {
    heading: 'مدیریت حساب‌های کارکنان',
    links: [
      operationalLinks.frontDesk,
      operationalLinks.accounts,
      operationalLinks.bookings,
      operationalLinks.rooms,
      operationalLinks.inventory,
      operationalLinks.close,
      operationalLinks.reports,
    ],
  },
  MANAGER: {
    heading: 'فضای مدیر اقامتگاه',
    links: [
      operationalLinks.frontDesk,
      operationalLinks.inventory,
      operationalLinks.rooms,
      operationalLinks.bookings,
      operationalLinks.close,
      operationalLinks.reports,
    ],
  },
  RECEPTIONIST: {
    heading: 'فضای پذیرش',
    links: [operationalLinks.frontDesk, operationalLinks.bookings],
  },
  HOUSEKEEPER: { heading: 'فضای خانه‌داری شما آماده است', links: [] },
  CASHIER: { heading: 'فضای صندوق شما آماده است', links: [operationalLinks.folioLookup] },
};

function WorkspaceLink({
  link,
}: {
  link: (typeof operationalLinks)[keyof typeof operationalLinks];
}) {
  return (
    <Link className={staffClass('staff-overview__action')} href={link.href}>
      <span className={staffClass('staff-overview__action-icon')} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 19.5h16M5.5 19V7.5h13V19M8 10h3v3H8zM13 10h3v3h-3z" />
        </svg>
      </span>
      <strong>{link.title}</strong>
      <span className={staffClass('staff-overview__action-description')}>{link.detail}</span>
      <span className={staffClass('staff-overview__action-link')}>
        رفتن به بخش <span aria-hidden="true">←</span>
      </span>
    </Link>
  );
}

export default function StaffDashboardPage() {
  const { status, staff } = useStaffSession();
  if (status !== 'authenticated' || !staff) return null;

  const workspace = roleWorkspace[staff.role];
  const { heading, links } = workspace;

  return (
    <section className={staffClass('staff-overview')} aria-labelledby="staff-home-title">
      <header className={staffClass('staff-overview__hero')}>
        <div className={staffClass('staff-overview__hero-copy')}>
          <p className={staffClass('staff-overview__note-index')}>خانه‌باغ نارنج · شیراز</p>
          <h1 id="staff-home-title">{heading}</h1>
          <p className={staffClass('staff-overview__intro')}>
            {staff.role === 'ADMIN'
              ? 'حساب‌های همکاران و دسترسی‌های پنل را از اینجا مدیریت کنید.'
              : `خوش آمدید، ${staff.username}. فضای کاری ${getStaffRoleLabel(staff.role)} در دسترس شماست.`}
          </p>
        </div>
        <aside className={staffClass('staff-overview__hero-note')} aria-label="وضعیت فضای کاری">
          <span className={staffClass('staff-overview__note-mark')} aria-hidden="true">
            ✦
          </span>
          <strong>{getStaffRoleLabel(staff.role)}</strong>
          <p>دسترسی‌ها بر اساس نقش کاری شما تنظیم شده‌اند.</p>
        </aside>
      </header>

      {links.length > 0 ? (
        <>
          <div className={staffClass('staff-overview__section-heading')}>
            <h2>دسترسی‌های کاری</h2>
            <p>بخش‌های قابل استفاده برای نقش شما</p>
          </div>
          <div className={staffClass('staff-overview__actions')}>
            {links.map((link) => (
              <WorkspaceLink key={link.href} link={link} />
            ))}
          </div>
        </>
      ) : (
        <section
          className={staffClass('staff-overview__quiet-state')}
          aria-label="وضعیت کارهای امروز"
        >
          <span aria-hidden="true">✓</span>
          <div>
            <h2>هیچ کاری برای انجام در این لحظه ثبت نشده است.</h2>
            <p>در صورت نیاز به پیگیری، از سرپرست شیفت راهنمایی بگیرید.</p>
          </div>
        </section>
      )}
    </section>
  );
}
