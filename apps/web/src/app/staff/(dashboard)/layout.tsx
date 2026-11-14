import type { ReactNode } from 'react';
import { ProtectedStaffArea } from '@/components/staff/protected-staff-area';

export default function StaffDashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ProtectedStaffArea>{children}</ProtectedStaffArea>;
}
