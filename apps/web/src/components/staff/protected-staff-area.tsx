'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { StaffDashboardShell } from './staff-dashboard-shell';
import { StaffSessionProvider, useStaffSession } from './staff-session-provider';

function SessionGate({ children }: Readonly<{ children: ReactNode }>) {
  const currentPath = usePathname() ?? '/staff';
  const { status, staff, error, logout, logoutError, isLoggingOut } = useStaffSession();

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
