import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaffDashboardShell } from './staff-dashboard-shell';

const receptionist = {
  username: 'reception',
  email: 'reception@example.test',
  role: 'RECEPTIONIST' as const,
};

describe('StaffDashboardShell', () => {
  it('keeps inventory navigation away from receptionists', () => {
    render(
      <StaffDashboardShell staff={receptionist} onLogout={vi.fn()}>
        <p>صفحه امن</p>
      </StaffDashboardShell>,
    );

    expect(screen.getByRole('link', { name: /^درخواست‌های رزرو/ })).toHaveAttribute(
      'href',
      '/staff/bookings',
    );
    expect(screen.queryByRole('link', { name: 'ظرفیت و نرخ‌ها' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'اتاق‌های فیزیکی' })).not.toBeInTheDocument();
    expect(screen.getByText('صفحه امن')).toBeInTheDocument();
  });

  it('uses the demo hotel name in the staff brand', () => {
    render(
      <StaffDashboardShell staff={receptionist} onLogout={vi.fn()}>
        <p>صفحه امن</p>
      </StaffDashboardShell>,
    );

    expect(
      screen.getByRole('link', { name: /^خانه‌باغ نارنج\s*پنل کارکنان$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('شیراز، خانه‌باغ نارنج')).toBeInTheDocument();
  });

  it('shows inventory navigation to administrators', () => {
    render(
      <StaffDashboardShell staff={{ ...receptionist, role: 'ADMIN' }} onLogout={vi.fn()}>
        <p>مدیریت اقامتگاه</p>
      </StaffDashboardShell>,
    );

    const inventoryLink = screen.getByRole('link', { name: /^ظرفیت و نرخ‌ها/ });
    expect(inventoryLink).toHaveAccessibleName('ظرفیت و نرخ‌ها تنظیم برنامه اتاق‌ها');
    expect(inventoryLink).toHaveAttribute(
      'href',
      '/staff/inventory',
    );
  });

  it('shows the physical rooms navigation to administrators and marks the active route', () => {
    render(
      <StaffDashboardShell
        staff={{ ...receptionist, role: 'ADMIN' }}
        onLogout={vi.fn()}
        currentPath="/staff/rooms/manage"
      >
        <p>مدیریت اتاق‌ها</p>
      </StaffDashboardShell>,
    );

    const roomsLink = screen.getByRole('link', { name: /^اتاق‌های فیزیکی/ });
    expect(roomsLink).toHaveAccessibleName('اتاق‌های فیزیکی شماره و وضعیت اتاق‌ها');
    expect(roomsLink).toHaveAttribute(
      'href',
      '/staff/rooms/manage',
    );
    expect(roomsLink).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('runs logout from a named control', () => {
    const onLogout = vi.fn();
    render(
      <StaffDashboardShell staff={receptionist} onLogout={onLogout}>
        <p>صفحه امن</p>
      </StaffDashboardShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'خروج از پنل' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
