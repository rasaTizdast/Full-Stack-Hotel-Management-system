import type { StaffRole } from './staff-api';

const staffHomePaths: Record<StaffRole, string> = {
  ADMIN: '/staff/staff',
  MANAGER: '/staff/inventory',
  RECEPTIONIST: '/staff/bookings',
  HOUSEKEEPER: '/staff',
  CASHIER: '/staff',
};

const staffRoleLabels: Record<StaffRole, string> = {
  ADMIN: 'مدیر اقامتگاه',
  MANAGER: 'مدیر شیفت',
  RECEPTIONIST: 'پذیرش',
  HOUSEKEEPER: 'خانه‌داری',
  CASHIER: 'صندوق',
};

export function getStaffHomePath(role: StaffRole): string {
  return staffHomePaths[role];
}

export function getStaffRoleLabel(role: StaffRole): string {
  return staffRoleLabels[role];
}
