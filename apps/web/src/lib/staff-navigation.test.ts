import { describe, expect, it } from 'vitest';
import { getStaffHomePath, getStaffRoleLabel } from './staff-navigation';

describe('staff navigation by role', () => {
  it.each([
    ['ADMIN', '/staff/front-desk/arrivals'],
    ['MANAGER', '/staff/front-desk/arrivals'],
    ['RECEPTIONIST', '/staff/front-desk/arrivals'],
    ['HOUSEKEEPER', '/staff'],
    ['CASHIER', '/staff'],
  ] as const)('sends %s to the first available workspace', (role, path) => {
    expect(getStaffHomePath(role)).toBe(path);
  });

  it.each([
    ['ADMIN', 'مدیر اقامتگاه'],
    ['MANAGER', 'مدیر شیفت'],
    ['RECEPTIONIST', 'پذیرش'],
    ['HOUSEKEEPER', 'خانه‌داری'],
    ['CASHIER', 'صندوق'],
  ] as const)('labels %s in Persian', (role, label) => {
    expect(getStaffRoleLabel(role)).toBe(label);
  });
});
