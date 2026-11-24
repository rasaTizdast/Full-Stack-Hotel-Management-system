'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
        session.staff.mustChangePassword
          ? '/staff/change-password'
          : getStaffHomePath(session.staff.role),
      );
    } catch (cause) {
      let message: string;
      if (cause instanceof StaffApiError && cause.status === 401) {
        message = 'ایمیل یا گذرواژه درست نیست.';
      } else if (cause instanceof StaffApiError && cause.status === 429) {
        message = 'تعداد تلاش‌های ورود زیاد است. چند دقیقه دیگر دوباره امتحان کنید.';
      } else {
        message =
          cause instanceof Error
            ? cause.message
            : 'ورود انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.';
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="staff-login-form" method="post" onSubmit={handleSubmit}>
      <Field className="staff-login-form__field">
        <FieldLabel htmlFor="staff-email">ایمیل کاری</FieldLabel>
        <Input
          className="staff-login-form__input"
          autoComplete="username"
          placeholder="name@hotel.com"
          dir="ltr"
          id="staff-email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          spellCheck={false}
          type="email"
          value={email}
        />
      </Field>
      <Field className="staff-login-form__field">
        <FieldLabel htmlFor="staff-password">گذرواژه</FieldLabel>
        <Input
          className="staff-login-form__input"
          autoComplete="current-password"
          placeholder="گذرواژهٔ حساب کاری"
          id="staff-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </Field>
      {error && (
        <p className="staff-login-form__error" role="alert">
          {error}
        </p>
      )}
      <Button
        className="staff-login-form__submit h-12 w-full rounded-lg px-5 text-base"
        size="lg"
        disabled={submitting}
        type="submit"
      >
        {submitting ? 'در حال ورود…' : 'ورود به پنل'}
      </Button>
      <p className="staff-login-form__privacy">
        دسترسی کارکنان با حساب کاری انجام می‌شود. اطلاعات ورود را با دیگران به اشتراک نگذارید.
      </p>
    </form>
  );
}
