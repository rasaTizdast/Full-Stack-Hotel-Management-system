import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffLoginForm } from './staff-login-form';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('StaffLoginForm', () => {
  beforeEach(() => {
    router.replace.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it.each([
    ['unknown email', { message: 'No staff account was found.', statusCode: 401 }],
    ['incorrect password', { message: 'Email or password is incorrect.', statusCode: 401 }],
  ])('shows the same sign-in error for %s', async (_caseName, responseBody) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 401 }));

    render(<StaffLoginForm />);
    fireEvent.change(screen.getByLabelText('ایمیل کاری'), {
      target: { value: 'staff@example.test' },
    });
    fireEvent.change(screen.getByLabelText('گذرواژه'), {
      target: { value: 'not-the-right-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ورود به پنل' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ایمیل یا گذرواژه درست نیست.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('staff@example.test');
  });

  it('sends credentials to the staff API and opens the role workspace after sign-in', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          staff: {
            username: 'admin',
            email: 'admin@example.test',
            role: 'ADMIN',
            mustChangePassword: false,
          },
          csrfToken: 'csrf-login',
        }),
        { status: 200 },
      ),
    );

    render(<StaffLoginForm />);
    fireEvent.change(screen.getByLabelText('ایمیل کاری'), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText('گذرواژه'), {
      target: { value: 'local-demo-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ورود به پنل' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/staff/staff'));
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'admin@example.test', password: 'local-demo-password-123' }),
      }),
    );
  });

  it('sends first-login staff to the required password update', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        staff: {
          username: 'new-cashier',
          email: 'cashier@example.test',
          role: 'CASHIER',
          mustChangePassword: true,
        },
        csrfToken: 'csrf-login',
      }),
    );

    render(<StaffLoginForm />);
    fireEvent.change(screen.getByLabelText('ایمیل کاری'), {
      target: { value: 'cashier@example.test' },
    });
    fireEvent.change(screen.getByLabelText('گذرواژه'), {
      target: { value: 'initial-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ورود به پنل' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/staff/change-password'));
  });
});
