import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStaffAdminAccount,
  deactivateStaffAdminAccount,
  getStaffAdminAccounts,
  updateStaffAdminAccountRole,
  type StaffAdminAccount,
  type StaffAdminAccountsPage,
} from './staff-admin-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  page: 2,
  pageSize: 25,
  total: 30,
};

describe('staff account API', () => {
  it('loads a private account page with the requested pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(accountPage));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffAdminAccounts(2, 25)).resolves.toEqual(accountPage);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/admin/accounts?page=2&pageSize=25',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('creates an account with the one-time initial password and CSRF proof', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(account));
    vi.stubGlobal('fetch', fetchMock);
    const payload = {
      username: 'reception-1',
      email: 'reception@example.test',
      initialPassword: 'one-time-initial-secret',
      role: 'RECEPTIONIST' as const,
    };

    await expect(createStaffAdminAccount(payload, 'csrf-token')).resolves.toEqual(account);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/admin/accounts',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
        body: JSON.stringify(payload),
      }),
    );
  });

  it('changes a role with a required reason and CSRF proof', async () => {
    const updated = { ...account, role: 'MANAGER' as const };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(updated));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateStaffAdminAccountRole('staff-123', 'MANAGER', 'Shift duties changed', 'csrf-token'),
    ).resolves.toEqual(updated);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/admin/accounts/staff-123/role',
      expect.objectContaining({
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
        body: JSON.stringify({ role: 'MANAGER', reason: 'Shift duties changed' }),
      }),
    );
  });

  it('deactivates an account with a reason and CSRF proof', async () => {
    const deactivated = { ...account, isActive: false };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(deactivated));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deactivateStaffAdminAccount('staff-123', 'Employment ended', 'csrf-token'),
    ).resolves.toEqual(deactivated);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/staff/admin/accounts/staff-123/deactivate',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
        body: JSON.stringify({ reason: 'Employment ended' }),
      }),
    );
  });
});
