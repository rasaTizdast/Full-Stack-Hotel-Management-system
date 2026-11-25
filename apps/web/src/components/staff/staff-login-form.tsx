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
    <form className="grid gap-5" method="post" onSubmit={handleSubmit}>
      <Field className="min-w-0 gap-2">
        <FieldLabel htmlFor="staff-email">ایمیل کاری</FieldLabel>
        <Input
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
      <Field className="min-w-0 gap-2">
        <FieldLabel htmlFor="staff-password">گذرواژه</FieldLabel>
        <Input
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
        <p
          className="rounded-xl border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm leading-7 text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      <Button
        className="h-12 w-full rounded-xl px-5 text-base"
        size="lg"
        disabled={submitting}
        type="submit"
      >
        {submitting ? 'در حال ورود…' : 'ورود به پنل'}
      </Button>
      <p className="text-sm leading-7 text-muted-foreground">
        دسترسی کارکنان با حساب کاری انجام می‌شود. اطلاعات ورود را با دیگران به اشتراک نگذارید.
      </p>
    </form>
  );
}
