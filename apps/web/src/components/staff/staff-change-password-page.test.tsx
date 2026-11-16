import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffChangePasswordPage } from './staff-change-password-page';
import { changeStaffPassword, type StaffSessionResponse } from '@/lib/staff-api';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'cashier-1',
      email: 'cashier@example.test',
      role: 'CASHIER' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: true,
    },
    csrfToken: 'csrf-current',
    refreshSession: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('./staff-session-provider', () => ({ useStaffSession: () => session.current }));
vi.mock('@/lib/staff-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/staff-api')>();
  return { ...actual, changeStaffPassword: vi.fn() };
});

describe('StaffChangePasswordPage', () => {
  beforeEach(() => {
    router.replace.mockReset();
    session.current.refreshSession.mockReset();
    session.current.staff.role = 'CASHIER';
    session.current.refreshSession.mockResolvedValue({
      staff: { ...session.current.staff, mustChangePassword: false },
      csrfToken: 'csrf-rotated',
    } satisfies StaffSessionResponse);
    vi.mocked(changeStaffPassword).mockReset().mockResolvedValue(undefined);
  });

  it('requires matching new password confirmation without sending the current password', async () => {
    render(<StaffChangePasswordPage />);
    fireEvent.change(screen.getByLabelText('گذرواژه فعلی'), {
      target: { value: 'initial-password' },
    });
    fireEvent.change(screen.getByLabelText('گذرواژه تازه'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('تکرار گذرواژه تازه'), {
      target: { value: 'different-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تغییر گذرواژه' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'گذرواژه تازه و تکرار آن یکسان نیست.',
    );
    expect(changeStaffPassword).not.toHaveBeenCalled();
    expect(session.current.refreshSession).not.toHaveBeenCalled();
  });

  it('changes the password, refreshes the authoritative session, and routes by role', async () => {
    render(<StaffChangePasswordPage />);
    fireEvent.change(screen.getByLabelText('گذرواژه فعلی'), {
      target: { value: 'initial-password' },
    });
    fireEvent.change(screen.getByLabelText('گذرواژه تازه'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('تکرار گذرواژه تازه'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تغییر گذرواژه' }));

    await waitFor(() =>
      expect(changeStaffPassword).toHaveBeenCalledWith(
        'initial-password',
        'new-password',
        'csrf-current',
      ),
    );
    await waitFor(() => expect(session.current.refreshSession).toHaveBeenCalledOnce());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/staff'));
    expect(screen.getByLabelText('گذرواژه فعلی')).toHaveValue('');
    expect(screen.getByLabelText('گذرواژه تازه')).toHaveValue('');
    expect(screen.getByLabelText('تکرار گذرواژه تازه')).toHaveValue('');
    expect(screen.queryByText('initial-password')).not.toBeInTheDocument();
  });

  it('shows a recoverable server error without redirecting', async () => {
    vi.mocked(changeStaffPassword).mockRejectedValueOnce(new Error('گذرواژه فعلی درست نیست.'));

    render(<StaffChangePasswordPage />);
    fireEvent.change(screen.getByLabelText('گذرواژه فعلی'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.change(screen.getByLabelText('گذرواژه تازه'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('تکرار گذرواژه تازه'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تغییر گذرواژه' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژه فعلی درست نیست.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('clears all credentials immediately after the password changes even if session refresh fails', async () => {
    session.current.refreshSession.mockRejectedValueOnce(new Error('وضعیت ورود تازه نشد.'));

    render(<StaffChangePasswordPage />);
    fireEvent.change(screen.getByLabelText('گذرواژه فعلی'), { target: { value: 'initial-password' } });
    fireEvent.change(screen.getByLabelText('گذرواژه تازه'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('تکرار گذرواژه تازه'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'تغییر گذرواژه' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('وضعیت ورود تازه نشد.');
    expect(screen.getByLabelText('گذرواژه فعلی')).toHaveValue('');
    expect(screen.getByLabelText('گذرواژه تازه')).toHaveValue('');
    expect(screen.getByLabelText('تکرار گذرواژه تازه')).toHaveValue('');
    expect(screen.queryByText('initial-password')).not.toBeInTheDocument();
  });
});
