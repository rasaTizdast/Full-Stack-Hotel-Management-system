'use client';

import { useStaffSession } from '@/components/staff/staff-session-provider';

export default function StaffDashboardPage() {
  const { status, staff } = useStaffSession();
  if (status !== 'authenticated' || !staff) return null;

  return (
    <section className="staff-overview" aria-labelledby="staff-overview-title">
      <p className="staff-overview__eyebrow">خانه‌باغ نارنج · شیراز</p>
      <h1 id="staff-overview-title">روز بخیر، {staff.username}</h1>
      <p className="staff-overview__intro">
        از اینجا درخواست‌های اقامت و برنامه‌ی اتاق‌ها را پیگیری کنید.
      </p>
      <div className="staff-overview__rule" />
      <div className="staff-overview__empty">
        <span className="staff-overview__symbol" aria-hidden="true">
          ◇
        </span>
        <div>
          <h2>میز کار شما آماده است</h2>
          <p>برای شروع، درخواست‌های رزرو را از منوی کنار صفحه باز کنید.</p>
        </div>
      </div>
    </section>
  );
}
