'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { StaffDashboardShell } from './staff-dashboard-shell';
import { StaffSessionProvider, useStaffSession } from './staff-session-provider';
import { getStaffHomePath } from '@/lib/staff-navigation';

function SessionGate({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const currentPath = usePathname() ?? '/staff';
  const { status, staff, error, logout, logoutError, isLoggingOut } = useStaffSession();
  const isPasswordChangePath = currentPath === '/staff/change-password';
  const redirectForCredentialChange = Boolean(
    status === 'authenticated' && staff?.mustChangePassword && !isPasswordChangePath,
  );
  const redirectToRoleHome = Boolean(
    status === 'authenticated' && staff && !staff.mustChangePassword && isPasswordChangePath,
  );

  useEffect(() => {
    if (status !== 'authenticated' || !staff) return;
    if (staff.mustChangePassword && !isPasswordChangePath) {
      router.replace('/staff/change-password');
    } else if (!staff.mustChangePassword && isPasswordChangePath) {
      router.replace(getStaffHomePath(staff.role));
    }
  }, [isPasswordChangePath, router, staff, status]);

  if (status === 'loading') {
    return (
      <main className="staff-session-state" aria-live="polite" aria-busy="true">
        <span className="staff-session-state__mark" aria-hidden="true" />
        <p>در حال بررسی دسترسی کارکنان…</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="staff-session-state" aria-live="polite">
        <h1>پنل کارکنان در دسترس نیست</h1>
        <p role="alert">{error}</p>
        <button className="button button--jade" onClick={() => window.location.reload()}>
          تلاش دوباره
        </button>
      </main>
    );
  }

  if (!staff) return null;

  if (redirectForCredentialChange || redirectToRoleHome) {
    return (
      <main className="staff-session-state" aria-live="polite" aria-busy="true">
        <span className="staff-session-state__mark" aria-hidden="true" />
        <p>
          {redirectForCredentialChange
            ? 'برای ادامه، گذرواژه آغازین را تغییر دهید…'
            : 'در حال بازکردن فضای کاری شما…'}
        </p>
      </main>
    );
  }

  return (
    <StaffDashboardShell
      staff={staff}
      onLogout={logout}
      isLoggingOut={isLoggingOut}
      logoutError={logoutError}
      currentPath={currentPath}
    >
      {children}
    </StaffDashboardShell>
  );
}

export function ProtectedStaffArea({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <StaffSessionProvider>
      <SessionGate>{children}</SessionGate>
    </StaffSessionProvider>
  );
}
