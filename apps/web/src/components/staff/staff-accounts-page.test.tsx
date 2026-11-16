import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffAccountsPage } from './staff-accounts-page';
import type { StaffAdminAccount, StaffAdminAccountsPage } from '@/lib/staff-admin-api';

const session = vi.hoisted(() => ({
  current: {
    status: 'authenticated' as const,
    staff: {
      username: 'admin',
      email: 'admin@example.test',
      role: 'ADMIN' as 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER',
      mustChangePassword: false,
    },
    csrfToken: 'csrf-admin',
  },
}));

const accountApi = vi.hoisted(() => ({
  getStaffAdminAccounts: vi.fn(),
  createStaffAdminAccount: vi.fn(),
  updateStaffAdminAccountRole: vi.fn(),
  deactivateStaffAdminAccount: vi.fn(),
}));

vi.mock('./staff-session-provider', () => ({
  useStaffSession: () => session.current,
}));

vi.mock('@/lib/staff-admin-api', () => accountApi);

const account: StaffAdminAccount = {
  id: 'staff-123',
  username: 'reception-1',
  email: 'reception@example.test',
  role: 'RECEPTIONIST',
  isActive: true,
  mustChangePassword: true,
  createdAt: '2026-11-16T07:00:00.000Z',
};

const accountPage: StaffAdminAccountsPage = {
  items: [account],
  page: 1,
  pageSize: 25,
  total: 1,
};

describe('StaffAccountsPage', () => {
  beforeEach(() => {
    session.current.staff.role = 'ADMIN';
    accountApi.getStaffAdminAccounts.mockReset().mockResolvedValue(accountPage);
    accountApi.createStaffAdminAccount.mockReset().mockResolvedValue(account);
    accountApi.updateStaffAdminAccountRole.mockReset().mockResolvedValue({
      ...account,
      role: 'MANAGER',
    });
    accountApi.deactivateStaffAdminAccount.mockReset().mockResolvedValue({
      ...account,
      isActive: false,
    });
  });

  it('shows safe account fields and paginates when the list exceeds one page', async () => {
    accountApi.getStaffAdminAccounts.mockResolvedValue({ ...accountPage, total: 30 });

    render(<StaffAccountsPage />);

    const row = await screen.findByRole('row', { name: /reception-1/ });
    expect(within(row).getByText('reception@example.test')).toBeInTheDocument();
    expect(within(row).getByText('پذیرش')).toBeInTheDocument();
    expect(within(row).getByText('گذرواژه آغازین تغییر نشده')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'صفحه‌های حساب کارکنان' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'صفحه بعد' })).toBeEnabled();
    expect(screen.queryByText('one-time-initial-secret')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'صفحه بعد' }));

    await waitFor(() => expect(accountApi.getStaffAdminAccounts).toHaveBeenLastCalledWith(2, 25));
  });

  it('shows every account field and action in the accessible mobile card list', async () => {
    render(<StaffAccountsPage />);

    const list = await screen.findByRole('list', { name: 'فهرست حساب‌های کارکنان' });
    const card = within(list).getByRole('listitem');
    expect(card).toHaveTextContent('reception-1');
    expect(card).toHaveTextContent('reception@example.test');
    expect(card).toHaveTextContent('پذیرش');
    expect(card).toHaveTextContent('فعال');
    expect(card).toHaveTextContent('گذرواژه آغازین تغییر نشده');
    expect(card).toHaveTextContent('2026-11-16');
    expect(within(card).getByRole('button', { name: 'تغییر نقش' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: 'غیرفعال‌سازی' })).toBeEnabled();
  });

  it('creates an account and clears the initial password after success', async () => {
    const created: StaffAdminAccount = {
      ...account,
      id: 'staff-456',
      username: 'new-cashier',
      email: 'cashier@example.test',
      role: 'CASHIER',
    };
    accountApi.createStaffAdminAccount.mockResolvedValue(created);
    accountApi.getStaffAdminAccounts
      .mockResolvedValueOnce(accountPage)
      .mockResolvedValue({ ...accountPage, items: [created], total: 2 });

    render(<StaffAccountsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'افزودن حساب' }));
    fireEvent.change(screen.getByLabelText('نام کاربری'), { target: { value: 'new-cashier' } });
    fireEvent.change(screen.getByLabelText('ایمیل کاری'), {
      target: { value: 'cashier@example.test' },
    });
    fireEvent.change(screen.getByLabelText('گذرواژه آغازین'), {
      target: { value: 'one-time-initial-secret' },
    });
    fireEvent.change(screen.getByLabelText('نقش'), { target: { value: 'CASHIER' } });
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد حساب' }));

    await waitFor(() =>
      expect(accountApi.createStaffAdminAccount).toHaveBeenCalledWith(
        {
          username: 'new-cashier',
          email: 'cashier@example.test',
          initialPassword: 'one-time-initial-secret',
          role: 'CASHIER',
        },
        'csrf-admin',
      ),
    );
    expect(await screen.findByLabelText('گذرواژه آغازین')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('حساب new-cashier ایجاد شد.');
    expect(screen.queryByText('one-time-initial-secret')).not.toBeInTheDocument();
  });

  it('updates an account role only with a non-empty reason', async () => {
    render(<StaffAccountsPage />);
    const row = await screen.findByRole('row', { name: /reception-1/ });
    fireEvent.click(within(row).getByRole('button', { name: 'تغییر نقش' }));
    const roleForm = within(row).getByRole('form', { name: 'تغییر نقش حساب reception-1' });
    fireEvent.change(within(roleForm).getByLabelText('نقش تازه'), { target: { value: 'MANAGER' } });
    fireEvent.submit(roleForm);

    expect(await within(roleForm).findByRole('alert')).toHaveTextContent('دلیل تغییر نقش را وارد کنید.');
    expect(accountApi.updateStaffAdminAccountRole).not.toHaveBeenCalled();

    fireEvent.change(within(roleForm).getByLabelText('دلیل تغییر نقش'), {
      target: { value: 'Coverage responsibilities changed' },
    });
    fireEvent.submit(roleForm);

    await waitFor(() =>
      expect(accountApi.updateStaffAdminAccountRole).toHaveBeenCalledWith(
        'staff-123',
        'MANAGER',
        'Coverage responsibilities changed',
        'csrf-admin',
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('نقش reception-1 تغییر کرد.');
  });

  it('requires a reason before deactivating a staff account', async () => {
    render(<StaffAccountsPage />);
    const row = await screen.findByRole('row', { name: /reception-1/ });
    fireEvent.click(within(row).getByRole('button', { name: 'غیرفعال‌سازی' }));
    const deactivateForm = within(row).getByRole('form', { name: 'غیرفعال‌سازی حساب reception-1' });
    fireEvent.submit(deactivateForm);

    expect(await within(deactivateForm).findByRole('alert')).toHaveTextContent('دلیل غیرفعال‌سازی را وارد کنید.');
    expect(accountApi.deactivateStaffAdminAccount).not.toHaveBeenCalled();

    fireEvent.change(within(deactivateForm).getByLabelText('دلیل غیرفعال‌سازی'), {
      target: { value: 'Employment ended' },
    });
    fireEvent.submit(deactivateForm);

    await waitFor(() =>
      expect(accountApi.deactivateStaffAdminAccount).toHaveBeenCalledWith(
        'staff-123',
        'Employment ended',
        'csrf-admin',
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('حساب reception-1 غیرفعال شد.');
  });

  it('shows empty and recoverable error states, and denies non-admins before loading data', async () => {
    accountApi.getStaffAdminAccounts.mockResolvedValue({
      ...accountPage,
      items: [],
      total: 0,
    });
    const { rerender } = render(<StaffAccountsPage />);
    expect(await screen.findByText('هنوز حسابی ثبت نشده است.')).toBeInTheDocument();

    accountApi.getStaffAdminAccounts.mockRejectedValueOnce(new Error('connection failed'));
    rerender(<StaffAccountsPage key="retry-error" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('connection failed');
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(accountApi.getStaffAdminAccounts).toHaveBeenCalledTimes(3));

    session.current.staff.role = 'RECEPTIONIST';
    accountApi.getStaffAdminAccounts.mockClear();
    rerender(<StaffAccountsPage key="not-admin" />);
    expect(await screen.findByRole('heading', { name: 'دسترسی به مدیریت کارکنان' })).toBeVisible();
    expect(accountApi.getStaffAdminAccounts).not.toHaveBeenCalled();
  });
});
