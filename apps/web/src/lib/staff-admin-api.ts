import { requestStaffApi, type StaffMember, type StaffRole } from './staff-api';

export interface StaffAdminAccount extends StaffMember {
  id: string;
  isActive: boolean;
  createdAt: string;
}

export interface StaffAdminAccountsPage {
  items: StaffAdminAccount[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CreateStaffAdminAccount {
  username: string;
  email: string;
  initialPassword: string;
  role: StaffRole;
}

export function getStaffAdminAccounts(
  page: number,
  pageSize: number,
): Promise<StaffAdminAccountsPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return requestStaffApi<StaffAdminAccountsPage>(`admin/accounts?${query.toString()}`);
}

export function createStaffAdminAccount(
  input: CreateStaffAdminAccount,
  csrfToken: string,
): Promise<StaffAdminAccount> {
  return requestStaffApi<StaffAdminAccount>('admin/accounts', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
}

export function updateStaffAdminAccountRole(
  accountId: string,
  role: StaffRole,
  reason: string,
  csrfToken: string,
): Promise<StaffAdminAccount> {
  return requestStaffApi<StaffAdminAccount>(
    `admin/accounts/${encodeURIComponent(accountId)}/role`,
    {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ role, reason }),
    },
  );
}

export function deactivateStaffAdminAccount(
  accountId: string,
  reason: string,
  csrfToken: string,
): Promise<StaffAdminAccount> {
  return requestStaffApi<StaffAdminAccount>(
    `admin/accounts/${encodeURIComponent(accountId)}/deactivate`,
    {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ reason }),
    },
  );
}
