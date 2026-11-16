'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCurrentStaff,
  logoutStaff,
  STAFF_SESSION_EXPIRED_EVENT,
  StaffApiError,
  type StaffMember,
} from '@/lib/staff-api';

type SessionStatus = 'loading' | 'authenticated' | 'error';

interface StaffSessionContextValue {
  status: SessionStatus;
  staff: StaffMember | null;
  csrfToken: string | null;
  error: string | null;
  logoutError: string | null;
  isLoggingOut: boolean;
  refreshSession: () => Promise<Awaited<ReturnType<typeof getCurrentStaff>>>;
  logout: () => Promise<void>;
}

const StaffSessionContext = createContext<StaffSessionContextValue | null>(null);

export function StaffSessionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const expireSession = useCallback(() => {
    setStatus('loading');
    setStaff(null);
    setCsrfToken(null);
    setError(null);
    router.replace('/staff/login');
  }, [router]);

  const refreshSession = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const session = await getCurrentStaff();
      setStaff(session.staff);
      setCsrfToken(session.csrfToken);
      setStatus('authenticated');
      return session;
    } catch (cause) {
      if (cause instanceof StaffApiError && cause.status === 401) {
        expireSession();
        throw cause;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'وضعیت ورود بررسی نشد. اتصال را بررسی و دوباره تلاش کنید.',
      );
      setStatus('error');
      throw cause;
    }
  }, [expireSession]);

  useEffect(() => {
    let current = true;

    const handleExpiry = () => {
      if (current) expireSession();
    };
    window.addEventListener(STAFF_SESSION_EXPIRED_EVENT, handleExpiry);

    getCurrentStaff()
      .then((session) => {
        if (!current) return;
        setStaff(session.staff);
        setCsrfToken(session.csrfToken);
        setStatus('authenticated');
      })
      .catch((cause: unknown) => {
        if (!current) return;
        if (cause instanceof StaffApiError && cause.status === 401) {
          expireSession();
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : 'وضعیت ورود بررسی نشد. اتصال را بررسی و دوباره تلاش کنید.',
        );
        setStatus('error');
      });

    return () => {
      current = false;
      window.removeEventListener(STAFF_SESSION_EXPIRED_EVENT, handleExpiry);
    };
  }, [expireSession]);

  const logout = useCallback(async () => {
    if (!csrfToken) {
      expireSession();
      return;
    }

    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logoutStaff(csrfToken);
      setStaff(null);
      setCsrfToken(null);
      router.replace('/staff/login');
    } catch (cause) {
      if (cause instanceof StaffApiError && cause.status === 401) {
        expireSession();
        return;
      }
      setLogoutError(cause instanceof Error ? cause.message : 'خروج انجام نشد. دوباره تلاش کنید.');
    } finally {
      setIsLoggingOut(false);
    }
  }, [csrfToken, expireSession, router]);

  const value = useMemo(
    () => ({
      status,
      staff,
      csrfToken,
      error,
      logoutError,
      isLoggingOut,
      refreshSession,
      logout,
    }),
    [status, staff, csrfToken, error, logoutError, isLoggingOut, refreshSession, logout],
  );

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionContextValue {
  const context = useContext(StaffSessionContext);
  if (!context) {
    throw new Error('useStaffSession must be used within StaffSessionProvider.');
  }
  return context;
}
