import type { ReactNode } from 'react';
import { StaffScrollBehavior } from '@/components/staff/staff-scroll-behavior';

export default function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <StaffScrollBehavior />
      {children}
    </div>
  );
}
