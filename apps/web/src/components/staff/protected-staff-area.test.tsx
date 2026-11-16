import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedStaffArea } from './protected-staff-area';
import { getCurrentStaff, StaffApiError } from '@/lib/staff-api';

const router = vi.hoisted(() => ({ replace: vi.fn(), path: '/staff' }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => router.path,
}));
vi.mock('@/lib/staff-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/staff-api')>();
  return { ...actual, getCurrentStaff: vi.fn(), logoutStaff: vi.fn() };
});

describe('ProtectedStaffArea', () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.path = '/staff';
  });

  it('does not render protected content and redirects when the API session is missing', async () => {
    vi.mocked(getCurrentStaff).mockRejectedValue(
      new StaffApiError('Authentication is required.', 401),
    );

    render(
      <ProtectedStaffArea>
        <p>اطلاعات خصوصی رزرو</p>
      </ProtectedStaffArea>,
    );

    expect(screen.queryByText('اطلاعات خصوصی رزرو')).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/staff/login'));
  });

  it('returns to sign-in when a protected API call reports session expiry', async () => {
    vi.mocked(getCurrentStaff).mockResolvedValue({
      staff: {
        username: 'admin',
        email: 'admin@example.test',
        role: 'ADMIN',
        mustChangePassword: false,
      },
      csrfToken: 'in-memory-csrf-token',
    });

    render(
      <ProtectedStaffArea>
        <p>پنل کارکنان</p>
      </ProtectedStaffArea>,
    );
    expect(await screen.findByText('پنل کارکنان', { selector: 'main p' })).toBeInTheDocument();

    window.dispatchEvent(new Event('hotel:staff-session-expired'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/staff/login'));
    expect(window.localStorage.length).toBe(0);
  });

  it('redirects a forced first-login session away from operational routes', async () => {
    router.path = '/staff/bookings';
    vi.mocked(getCurrentStaff).mockResolvedValue({
      staff: {
        username: 'new-reception',
        email: 'reception@example.test',
        role: 'RECEPTIONIST',
        mustChangePassword: true,
      },
      csrfToken: 'initial-csrf-token',
    });

    render(
      <ProtectedStaffArea>
        <p>اطلاعات رزروها</p>
      </ProtectedStaffArea>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/staff/change-password'));
    expect(screen.queryByText('اطلاعات رزروها')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /درخواست‌های رزرو/ })).not.toBeInTheDocument();
  });

  it('sends sessions that completed the forced change to their role home', async () => {
    router.path = '/staff/change-password';
    vi.mocked(getCurrentStaff).mockResolvedValue({
      staff: {
        username: 'reception',
        email: 'reception@example.test',
        role: 'RECEPTIONIST',
        mustChangePassword: false,
      },
      csrfToken: 'rotated-csrf-token',
    });

    render(
      <ProtectedStaffArea>
        <p>تغییر گذرواژه</p>
      </ProtectedStaffArea>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/staff/bookings'));
    expect(screen.queryByText('تغییر گذرواژه')).not.toBeInTheDocument();
  });
});
