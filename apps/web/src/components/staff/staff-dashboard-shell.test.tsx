import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaffDashboardShell } from './staff-dashboard-shell';

const receptionist = {
  username: 'reception',
  email: 'reception@example.test',
  role: 'RECEPTIONIST' as const,
  mustChangePassword: false,
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

  it('exposes the operational room board to reception without exposing the catalog editor', () => {
    render(
      <StaffDashboardShell
        staff={receptionist}
        onLogout={vi.fn()}
        currentPath="/staff/rooms"
      >
        <p>وضعیت اتاق‌ها</p>
      </StaffDashboardShell>,
    );

    const boardLink = screen.getByRole('link', { name: /^وضعیت اتاق‌ها/ });
    expect(boardLink).toHaveAttribute('href', '/staff/rooms');
    expect(boardLink).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: /^اتاق‌های فیزیکی/ })).not.toBeInTheDocument();
  });

  it('keeps operational-board and physical-catalog active states distinct', () => {
    const { rerender } = render(
      <StaffDashboardShell
        staff={{ ...receptionist, role: 'ADMIN' }}
        onLogout={vi.fn()}
        currentPath="/staff/rooms"
      >
        <p>وضعیت اتاق‌ها</p>
      </StaffDashboardShell>,
    );

    const boardLink = screen.getByRole('link', { name: /^وضعیت اتاق‌ها/ });
    const catalogLink = screen.getByRole('link', { name: /^اتاق‌های فیزیکی/ });
    expect(boardLink).toHaveAttribute('aria-current', 'page');
    expect(catalogLink).not.toHaveAttribute('aria-current', 'page');

    rerender(
      <StaffDashboardShell
        staff={{ ...receptionist, role: 'ADMIN' }}
        onLogout={vi.fn()}
        currentPath="/staff/rooms/manage"
      >
        <p>مدیریت اتاق‌های فیزیکی</p>
      </StaffDashboardShell>,
    );

    expect(boardLink).not.toHaveAttribute('aria-current', 'page');
    expect(catalogLink).toHaveAttribute('aria-current', 'page');
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

  it('shows current shipped destinations according to each staff role', () => {
    const { rerender } = render(
      <StaffDashboardShell staff={{ ...receptionist, role: 'MANAGER' }} onLogout={vi.fn()}>
        <p>صفحه مدیر</p>
      </StaffDashboardShell>,
    );

    expect(screen.getByRole('link', { name: /^درخواست‌های رزرو/ })).toHaveAttribute(
      'href',
      '/staff/bookings',
    );
    expect(screen.getByRole('link', { name: /^اتاق‌های فیزیکی/ })).toHaveAttribute(
      'href',
      '/staff/rooms/manage',
    );
    expect(screen.getByRole('link', { name: /^ظرفیت و نرخ‌ها/ })).toHaveAttribute(
      'href',
      '/staff/inventory',
    );
    expect(screen.queryByRole('link', { name: /^حساب‌های کارکنان/ })).not.toBeInTheDocument();

    rerender(
      <StaffDashboardShell staff={receptionist} onLogout={vi.fn()}>
        <p>صفحه پذیرش</p>
      </StaffDashboardShell>,
    );
    expect(screen.queryByRole('link', { name: /^اتاق‌های فیزیکی/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^ظرفیت و نرخ‌ها/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^حساب‌های کارکنان/ })).not.toBeInTheDocument();
  });

  it('limits forced-password sessions to the password-change route', () => {
    render(
      <StaffDashboardShell
        staff={{ ...receptionist, role: 'CASHIER', mustChangePassword: true }}
        onLogout={vi.fn()}
        currentPath="/staff/change-password"
      >
        <p>تغییر گذرواژه</p>
      </StaffDashboardShell>,
    );

    expect(screen.getByRole('link', { name: /^تغییر گذرواژه الزامی/ })).toHaveAttribute(
      'href',
      '/staff/change-password',
    );
    expect(screen.queryByRole('link', { name: /^درخواست‌های رزرو/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^ظرفیت و نرخ‌ها/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^حساب‌های کارکنان/ })).not.toBeInTheDocument();
  });

  it('labels all named roles in Persian', () => {
    const { rerender } = render(
      <StaffDashboardShell staff={{ ...receptionist, role: 'MANAGER' }} onLogout={vi.fn()}>
        <p>صفحه مدیر</p>
      </StaffDashboardShell>,
    );
    expect(screen.getByText('مدیر شیفت')).toBeInTheDocument();

    rerender(
      <StaffDashboardShell staff={{ ...receptionist, role: 'HOUSEKEEPER' }} onLogout={vi.fn()}>
        <p>صفحه خانه‌داری</p>
      </StaffDashboardShell>,
    );
    expect(screen.getByText('خانه‌داری')).toBeInTheDocument();

    rerender(
      <StaffDashboardShell staff={{ ...receptionist, role: 'CASHIER' }} onLogout={vi.fn()}>
        <p>صفحه صندوق</p>
      </StaffDashboardShell>,
    );
    expect(screen.getByText('صندوق')).toBeInTheDocument();
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

  it('keeps the active route visible using only the nav scroll container', () => {
    const originalScrollBy = HTMLElement.prototype.scrollBy;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollBy = vi.fn();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function (this: HTMLElement) {
        if (this.matches('.staff-nav')) {
          return { left: 0, right: 100 } as DOMRect;
        }
        if (this.matches('.staff-nav a[aria-current="page"]')) {
          return { left: -20, right: 60 } as DOMRect;
        }
        return originalGetBoundingClientRect.call(this);
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      const { container, rerender } = render(
        <StaffDashboardShell
          staff={{ ...receptionist, role: 'ADMIN' }}
          onLogout={vi.fn()}
          currentPath="/staff/rooms/manage"
        >
          <p>مدیریت اتاق‌ها</p>
        </StaffDashboardShell>,
      );

      expect(container.querySelector('[data-staff-nav-overflow-cue]')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(scrollBy).toHaveBeenCalledWith({ left: -28, behavior: 'instant' });
      expect(scrollIntoView).not.toHaveBeenCalled();
      scrollBy.mockClear();

      rerender(
        <StaffDashboardShell
          staff={{ ...receptionist, role: 'ADMIN' }}
          onLogout={vi.fn()}
          currentPath="/staff/inventory"
        >
          <p>مدیریت موجودی</p>
        </StaffDashboardShell>,
      );

      expect(scrollBy).toHaveBeenCalledWith({ left: -28, behavior: 'instant' });
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: /^ظرفیت و نرخ‌ها/ })).toHaveAttribute(
        'aria-current',
        'page',
      );
    } finally {
      if (originalScrollBy) {
        Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
          configurable: true,
          value: originalScrollBy,
        });
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollBy;
      }
      Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect,
      });
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
    }
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
