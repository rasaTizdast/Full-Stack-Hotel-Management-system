'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { changeStaffPassword } from '@/lib/staff-api';
import { getStaffHomePath } from '@/lib/staff-navigation';
import { useStaffSession } from './staff-session-provider';

export function StaffChangePasswordPage() {
  const router = useRouter();
  const { staff, csrfToken, refreshSession } = useStaffSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !csrfToken) return;
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmation) {
      setError('گذرواژه تازه و تکرار آن یکسان نیست.');
      return;
    }
    setIsSaving(true);
    try {
      await changeStaffPassword(currentPassword, newPassword, csrfToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      const refreshed = await refreshSession();
      setSuccess('گذرواژه تغییر کرد. در حال ورود به فضای کاری شما…');
      router.replace(getStaffHomePath(refreshed.staff.role));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تغییر گذرواژه انجام نشد. دوباره تلاش کنید.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="staff-password" aria-labelledby="staff-password-title">
      <div className="staff-password__intro">
        <p className="staff-password__eyebrow">اقدام امنیتی لازم</p>
        <h1 id="staff-password-title">تغییر گذرواژه</h1>
        <p>برای ادامه کار، گذرواژه موقت حساب خود را با یک گذرواژه تازه جایگزین کنید.</p>
        {staff && <span>حساب {staff.username}</span>}
      </div>
      <form className="staff-password__form" onSubmit={submit}>
        <label>
          گذرواژه فعلی
          <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label>
          گذرواژه تازه
          <input type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label>
          تکرار گذرواژه تازه
          <input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
        {error && <p className="staff-password__error" role="alert">{error}</p>}
        {success && <p className="staff-password__success" role="status">{success}</p>}
        <button className="staff-accounts__primary" type="submit" disabled={isSaving}>
          {isSaving ? 'در حال ذخیره…' : 'تغییر گذرواژه'}
        </button>
      </form>
    </section>
  );
}
