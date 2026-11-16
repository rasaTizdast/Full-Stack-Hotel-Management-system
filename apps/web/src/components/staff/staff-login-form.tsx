'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { loginStaff, StaffApiError } from '@/lib/staff-api';
import { getStaffHomePath } from '@/lib/staff-navigation';

export function StaffLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const session = await loginStaff(email.trim(), password);
      router.replace(
        session.staff.mustChangePassword ? '/staff/change-password' : getStaffHomePath(session.staff.role),
      );
    } catch (cause) {
      if (cause instanceof StaffApiError && cause.status === 401) {
        setError('ایمیل یا گذرواژه درست نیست.');
      } else if (cause instanceof StaffApiError && cause.status === 429) {
        setError('تعداد تلاش‌های ورود زیاد است. چند دقیقه دیگر دوباره امتحان کنید.');
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : 'ورود انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="staff-login-form" onSubmit={handleSubmit}>
      <div className="staff-login-form__field">
        <label htmlFor="staff-email">ایمیل کاری</label>
        <input
          autoComplete="username"
          dir="ltr"
          id="staff-email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          spellCheck={false}
          type="email"
          value={email}
        />
      </div>
      <div className="staff-login-form__field">
        <label htmlFor="staff-password">گذرواژه</label>
        <input
          autoComplete="current-password"
          id="staff-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      {error && (
        <p className="staff-login-form__error" role="alert">
          {error}
        </p>
      )}
      <button className="staff-login-form__submit" disabled={submitting} type="submit">
        {submitting ? 'در حال ورود…' : 'ورود به پنل'}
      </button>
      <p className="staff-login-form__privacy">
        دسترسی کارکنان با حساب کاری انجام می‌شود. اطلاعات ورود را با دیگران به اشتراک نگذارید.
      </p>
    </form>
  );
}
