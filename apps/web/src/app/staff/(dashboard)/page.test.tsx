import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StaffDashboardPage from './page';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'staff-user',
      email: 'staff@example.test',
      role: 'RECEPTIONIST' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
  },
}));

vi.mock('@/components/staff/staff-session-provider', () => ({
  useStaffSession: () => session.current,
}));

describe('StaffDashboardPage', () => {
  it('gives managers quick links only to available manager workspaces', () => {
    session.current.staff.role = 'MANAGER';
    render(<StaffDashboardPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'فضای مدیر اقامتگاه' })).toBeVisible();
    expect(screen.getByRole('link', { name: /^مدیریت ظرفیت و نرخ‌ها/ })).toHaveAttribute(
      'href',
      '/staff/inventory',
    );
    expect(screen.getByRole('link', { name: /^مدیریت اتاق‌های فیزیکی/ })).toHaveAttribute(
      'href',
      '/staff/rooms/manage',
    );
    expect(screen.getByRole('link', { name: /^مشاهده درخواست‌های رزرو/ })).toHaveAttribute(
      'href',
      '/staff/bookings',
    );
    expect(screen.queryByRole('link', { name: /خانه‌داری|صندوق/ })).not.toBeInTheDocument();
  });

  it('makes staff administration the main admin action', () => {
    session.current.staff.role = 'ADMIN';
    render(<StaffDashboardPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'مدیریت حساب‌های کارکنان' })).toBeVisible();
    expect(screen.getByRole('link', { name: /^مدیریت کارکنان/ })).toHaveAttribute(
      'href',
      '/staff/staff',
    );
  });

  it.each([
    ['HOUSEKEEPER', 'فضای خانه‌داری شما آماده است'],
    ['CASHIER', 'فضای صندوق شما آماده است'],
  ] as const)('shows a calm role-specific home for %s without broken workspace links', (role, heading) => {
    session.current.staff.role = role;
    const { container } = render(<StaffDashboardPage />);

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(container.querySelectorAll('a[href^="/staff/"]')).toHaveLength(0);
    expect(screen.getByText('هیچ کاری برای انجام در این لحظه ثبت نشده است.')).toBeVisible();
  });
});
